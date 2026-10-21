begin;

alter table public.complaints drop constraint if exists complaints_status_check;

alter table public.complaints
  add column if not exists due_date date,
  add column if not exists started_at timestamptz,
  add column if not exists resolved_at timestamptz;

update public.complaints set status = 'assigned' where status = 'converted';

update public.complaints c
set status = 'resolved',
    started_at = coalesce(c.started_at, i.updated_at, c.reviewed_at),
    resolved_at = coalesce(c.resolved_at, now())
from public.inspections i
where c.inspection_id = i.id
  and c.status = 'assigned'
  and i.status = 'submitted'
  and exists (
    select 1 from public.reports r
    where r.inspection_id = i.id and r.status = 'published'
  );

update public.complaints c
set status = 'in_progress',
    started_at = coalesce(c.started_at, i.updated_at, now())
from public.inspections i
where c.inspection_id = i.id
  and c.status = 'assigned'
  and (
    i.updated_at is not null
    or exists (select 1 from public.findings f where f.inspection_id = i.id)
    or exists (select 1 from public.reports r where r.inspection_id = i.id)
  );

update public.complaints
set status = 'pending', reviewed_by = null, reviewed_at = null, due_date = null
where status = 'assigned' and inspection_id is null;

alter table public.complaints
  add constraint complaints_status_check
  check (status in ('pending', 'assigned', 'in_progress', 'resolved', 'rejected'));

create index if not exists complaints_inspection_idx on public.complaints (inspection_id);
create index if not exists complaints_open_due_idx on public.complaints (due_date)
  where status in ('assigned', 'in_progress');

commit;
