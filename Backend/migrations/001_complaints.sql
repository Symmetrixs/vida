begin;

do $$
begin
  if to_regclass('public.complaints') is not null
     and exists (select 1 from public.complaints) then
    raise exception 'public.complaints already holds rows; migrate them by hand before running this script';
  end if;
end $$;

drop table if exists public.complaint_photos;
drop table if exists public.complaints;

create table public.complaints (
  id              uuid primary key default gen_random_uuid(),
  ref_no          bigint generated always as identity unique,
  building_id     uuid not null references public.buildings(id) on delete restrict,
  floor           text not null check (char_length(floor) between 1 and 40),
  location_note   text not null check (char_length(location_note) between 1 and 200),
  description     text not null check (char_length(description) between 10 and 2000),
  reporter_name   text check (char_length(reporter_name) <= 100),
  reporter_email  text check (char_length(reporter_email) <= 254),
  reporter_phone  text check (char_length(reporter_phone) <= 20),
  status          text not null default 'pending' check (status in ('pending', 'converted', 'rejected')),
  reject_reason   text check (char_length(reject_reason) <= 500),
  inspection_id   uuid references public.inspections(id) on delete set null,
  reviewed_by     uuid references public.users(id) on delete set null,
  reviewed_at     timestamptz,
  ip_hash         text not null,
  captcha_nonce   text not null unique,
  created_at      timestamptz not null default now(),
  constraint complaints_reject_reason_required check (status <> 'rejected' or reject_reason is not null)
);

create index complaints_ip_hash_created_idx on public.complaints (ip_hash, created_at);
create index complaints_status_created_idx on public.complaints (status, created_at desc);

create table public.complaint_photos (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.complaints(id) on delete cascade,
  storage_path  text not null,
  content_type  text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  width         integer not null,
  height        integer not null,
  created_at    timestamptz not null default now()
);

create index complaint_photos_complaint_idx on public.complaint_photos (complaint_id);

alter table public.complaints enable row level security;
alter table public.complaint_photos enable row level security;

insert into storage.buckets (id, name, public)
values ('vida-complaints', 'vida-complaints', false)
on conflict (id) do update set public = false;

commit;
