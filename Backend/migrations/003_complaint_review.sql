begin;

alter table public.complaints drop constraint if exists complaints_status_check;
alter table public.complaints drop constraint if exists complaints_reviewed_needs_severity;

alter table public.complaints
  add column if not exists submitted_at timestamptz,
  add column if not exists severity text check (severity in ('low', 'medium', 'high', 'critical')),
  add column if not exists severity_note text check (char_length(severity_note) <= 1000),
  add column if not exists assessed_by uuid references public.users(id) on delete set null,
  add column if not exists assessed_at timestamptz;

update public.complaints c
set status = 'submitted',
    submitted_at = coalesce(i.submitted_at, c.resolved_at, now())
from public.inspections i
where c.inspection_id = i.id
  and c.status in ('assigned', 'in_progress', 'resolved')
  and i.status = 'submitted';

update public.complaints
set status = 'in_progress'
where status = 'resolved';

alter table public.complaints drop column if exists resolved_at;

alter table public.complaints
  add constraint complaints_status_check
  check (status in ('pending', 'assigned', 'in_progress', 'submitted', 'reviewed', 'rejected'));

alter table public.complaints
  add constraint complaints_reviewed_needs_severity
  check (status <> 'reviewed' or severity is not null);

commit;
