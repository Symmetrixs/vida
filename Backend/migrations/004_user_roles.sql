begin;

do $$
begin
  if to_regclass('public.user_roles') is not null then
    raise exception 'public.user_roles already exists; this migration has already been run';
  end if;
end $$;

create table public.user_roles (
  user_id     uuid not null references public.users(id) on delete cascade,
  role        text not null check (role in ('inspector', 'maintenance', 'facility_manager', 'admin')),
  granted_by  uuid references public.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

alter table public.user_roles enable row level security;

insert into public.user_roles (user_id, role)
select id, role
from public.users
where role in ('inspector', 'facility_manager', 'admin');

insert into public.user_roles (user_id, role)
select u.id, 'inspector'
from public.users u
where u.role in ('admin', 'facility_manager')
  and (
    exists (select 1 from public.inspections i where i.inspector_id = u.id)
    or exists (select 1 from public.reports r where r.created_by = u.id)
  )
on conflict do nothing;

update public.users
set is_active = false
where role in ('admin', 'facility_manager')
  and is_approved is distinct from true;

do $$
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.role = 'admin' and u.is_active is true
  ) then
    raise exception 'no active admin after moving roles; approve an admin account before running this script';
  end if;
end $$;

alter table public.users alter column role drop not null;
alter table public.users alter column role drop default;

alter table public.inspections add column ref_no bigint;

with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public.inspections
)
update public.inspections i
set ref_no = numbered.n
from numbered
where numbered.id = i.id;

alter table public.inspections alter column ref_no set not null;

do $$
declare
  next_no bigint;
begin
  select coalesce(max(ref_no), 0) + 1 into next_no from public.inspections;
  execute format(
    'alter table public.inspections alter column ref_no add generated always as identity (start with %s)',
    next_no
  );
end $$;

alter table public.inspections add constraint inspections_ref_no_key unique (ref_no);

update public.notifications
set link = regexp_replace(link, '^/admin/complaints\?open=([0-9a-fA-F-]+)$', '/complaints/\1/review')
where link ~ '^/admin/complaints\?open=';

update public.notifications
set link = regexp_replace(link, '^/(inspector|admin)/', '/')
where link ~ '^/(inspector|admin)/';

commit;
