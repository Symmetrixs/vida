begin;

do $$
begin
  if to_regclass('public.user_roles') is null or to_regclass('public.repair_jobs') is null then
    raise exception 'run migrations 004 and 005 before this one';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name in ('role', 'is_approved')
  ) then
    raise exception 'users.role and users.is_approved are already gone; this migration has already been run';
  end if;
  if not exists (
    select 1
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.role = 'admin' and u.is_active is true
  ) then
    raise exception 'no active admin in user_roles; fix that before dropping the old role column';
  end if;
end $$;

alter table public.users drop column if exists role;
alter table public.users drop column if exists is_approved;

create function pg_temp.vida_floor(label text) returns text
language sql immutable as $$
  select case
    when label ~* '^\s*(g|gf|ground|ground\s*floor|ground\s*level|(level|lvl|floor|flr|l|f)\s*[-.]?\s*0+)\s*$'
      then 'Ground Floor'
    when label ~* '^\s*(roof|rooftop|roof\s*top|roof\s*level)\s*$'
      then 'Rooftop'
    when label ~* '^\s*(level|lvl|floor|flr|l|f)\s*[-.]?\s*0*[1-9][0-9]*\s*$'
      then 'Floor ' || (regexp_match(label, '0*([1-9][0-9]*)\s*$'))[1]
    when label ~* '^\s*0*[1-9][0-9]*\s*(st|nd|rd|th)?\s*(floor|level)\s*$'
      then 'Floor ' || (regexp_match(label, '^\s*0*([1-9][0-9]*)'))[1]
    else label
  end
$$;

update public.inspections
set floor_level = pg_temp.vida_floor(floor_level)
where floor_level is not null
  and floor_level is distinct from pg_temp.vida_floor(floor_level);

update public.complaints
set floor = pg_temp.vida_floor(floor)
where floor is distinct from pg_temp.vida_floor(floor);

commit;
