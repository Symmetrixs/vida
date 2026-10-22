begin;

do $$
begin
  if to_regclass('public.repair_jobs') is not null then
    raise exception 'public.repair_jobs already exists; this migration has already been run';
  end if;
end $$;

alter table public.inspections
  add column severity      text check (severity in ('low', 'medium', 'high', 'critical')),
  add column severity_note text check (char_length(severity_note) <= 1000),
  add column assessed_by   uuid references public.users(id) on delete set null,
  add column assessed_at   timestamptz;

update public.inspections i
set severity      = c.severity,
    severity_note = c.severity_note,
    assessed_by   = c.assessed_by,
    assessed_at   = coalesce(c.assessed_at, now())
from public.complaints c
where c.inspection_id = i.id
  and c.status = 'reviewed'
  and c.severity is not null;

create index inspections_review_idx on public.inspections (status, severity);

alter table public.complaint_photos
  add column detections jsonb,
  add column scanned_at timestamptz;

create table public.repair_jobs (
  id               uuid primary key default gen_random_uuid(),
  ref_no           bigint generated always as identity unique,
  inspection_id    uuid not null unique references public.inspections(id) on delete restrict,
  status           text not null default 'open' check (status in ('open', 'in_progress', 'awaiting_review', 'done')),
  assigned_to      uuid references public.users(id) on delete set null,
  assignment_type  text check (assignment_type in ('assigned', 'claimed')),
  due_date         date,
  repair_notes     text check (char_length(repair_notes) <= 2000),
  rework_count     integer not null default 0 check (rework_count >= 0),
  round            integer not null default 1 check (round >= 1),
  before_counts    jsonb,
  created_by       uuid references public.users(id) on delete set null,
  approved_by      uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  submitted_at     timestamptz,
  completed_at     timestamptz,
  constraint repair_jobs_open_is_unassigned check ((status = 'open') = (assignment_type is null)),
  constraint repair_jobs_done_is_dated check (status <> 'done' or completed_at is not null)
);

create index repair_jobs_status_idx on public.repair_jobs (status, created_at desc);
create index repair_jobs_assigned_idx on public.repair_jobs (assigned_to, status);

create table public.repair_job_events (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.repair_jobs(id) on delete restrict,
  event       text not null check (event in ('created', 'claimed', 'assigned', 'reassigned', 'submitted', 'sent_back', 'approved')),
  actor_id    uuid references public.users(id) on delete set null,
  from_user   uuid references public.users(id) on delete set null,
  to_user     uuid references public.users(id) on delete set null,
  reason      text check (char_length(reason) <= 500),
  note        text check (char_length(note) <= 2000),
  round       integer not null default 1,
  created_at  timestamptz not null default now(),
  constraint repair_job_events_reason_required check (event not in ('reassigned', 'sent_back') or reason is not null)
);

create index repair_job_events_job_idx on public.repair_job_events (job_id, created_at);

create function public.repair_job_events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'repair job history cannot be deleted';
end;
$$;

create trigger repair_job_events_no_delete
before delete on public.repair_job_events
for each row execute function public.repair_job_events_append_only();

create table public.repair_photos (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references public.repair_jobs(id) on delete restrict,
  round         integer not null default 1,
  filename      text not null,
  url           text not null,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer not null check (size_bytes > 0),
  uploaded_by   uuid references public.users(id) on delete set null,
  detections    jsonb,
  scanned_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index repair_photos_job_idx on public.repair_photos (job_id, round);

alter table public.repair_jobs enable row level security;
alter table public.repair_job_events enable row level security;
alter table public.repair_photos enable row level security;

update public.notifications n
set link = '/inspections/' || c.inspection_id || '/review'
from public.complaints c
where n.link = '/complaints/' || c.id || '/review'
  and c.inspection_id is not null;

commit;
