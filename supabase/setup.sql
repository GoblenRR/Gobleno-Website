create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('work-images', 'work-images', true)
on conflict (id) do update
set public = excluded.public;

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('music', 'ui', 'games', 'extras')),
  title text not null default '',
  body text not null default '',
  link_url text,
  image_url text,
  image_alt text,
  audio_url text,
  audio_type text,
  audio_size_bytes integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_entries
  add column if not exists link_url text;

alter table public.work_entries
  add column if not exists image_url text;

alter table public.work_entries
  add column if not exists image_alt text;

alter table public.work_entries
  add column if not exists audio_url text;

alter table public.work_entries
  add column if not exists audio_type text;

alter table public.work_entries
  add column if not exists audio_size_bytes integer;

create index if not exists work_entries_section_sort_idx
  on public.work_entries (section, sort_order, created_at desc);

create or replace function public.set_work_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_entries_updated_at on public.work_entries;

create trigger trg_work_entries_updated_at
before update on public.work_entries
for each row
execute function public.set_work_entries_updated_at();

alter table public.work_entries enable row level security;

drop policy if exists "No direct anonymous access to work_entries" on public.work_entries;

create policy "No direct anonymous access to work_entries"
on public.work_entries
for all
to anon, authenticated
using (false)
with check (false);
