begin;

do $$
begin
  if to_regclass('public.building_rooms') is not null then
    raise exception 'public.building_rooms already exists; this migration has already been run';
  end if;
end $$;

create table public.building_rooms (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings(id) on delete cascade,
  floor       text not null check (char_length(floor) between 1 and 40),
  name        text not null check (char_length(name) between 1 and 100),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index building_rooms_unique_name on public.building_rooms (building_id, floor, lower(name));
create index building_rooms_lookup_idx on public.building_rooms (building_id, floor, sort_order);

alter table public.complaints alter column captcha_nonce drop not null;

alter table public.users
  add column status        text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  add column reject_reason text check (char_length(reject_reason) <= 500),
  add column reviewed_by   uuid references public.users(id) on delete set null,
  add column reviewed_at   timestamptz;

create index users_status_idx on public.users (status);

alter table public.photos add column scanned_at timestamptz;

alter table public.findings
  add column source       text not null default 'manual' check (source in ('ai', 'manual')),
  add column dismissed_at timestamptz,
  add column dismissed_by uuid references public.users(id) on delete set null,
  add column edited_by    uuid references public.users(id) on delete set null;

update public.findings set source = 'ai' where confidence is not null;

update public.photos p
set scanned_at = coalesce(
  (select min(f.created_at) from public.findings f where f.photo_id = p.id and f.source = 'ai'),
  now()
)
where exists (select 1 from public.findings f where f.photo_id = p.id and f.source = 'ai');

create index findings_photo_idx on public.findings (photo_id) where dismissed_at is null;

commit;
