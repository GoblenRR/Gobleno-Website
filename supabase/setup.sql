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

create table if not exists public.site_metrics (
  metric_key text primary key,
  metric_value bigint not null default 0,
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

create or replace function public.set_site_metrics_updated_at()
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

drop trigger if exists trg_site_metrics_updated_at on public.site_metrics;

create trigger trg_site_metrics_updated_at
before update on public.site_metrics
for each row
execute function public.set_site_metrics_updated_at();

alter table public.work_entries enable row level security;
alter table public.site_metrics enable row level security;

drop policy if exists "No direct anonymous access to work_entries" on public.work_entries;
drop policy if exists "No direct anonymous access to site_metrics" on public.site_metrics;

create policy "No direct anonymous access to work_entries"
on public.work_entries
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct anonymous access to site_metrics"
on public.site_metrics
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.increment_site_metric(target_key text, increment_amount bigint default 1)
returns table (metric_key text, metric_value bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_increment bigint := greatest(coalesce(increment_amount, 1), 0);
begin
  insert into public.site_metrics (metric_key, metric_value)
  values (target_key, safe_increment)
  on conflict (metric_key) do update
  set metric_value = public.site_metrics.metric_value + safe_increment,
      updated_at = now();

  return query
  select sm.metric_key, sm.metric_value, sm.updated_at
  from public.site_metrics sm
  where sm.metric_key = target_key;
end;
$$;

create or replace function public.storage_object_name_from_public_url(asset_url text, expected_bucket text default 'work-images')
returns text
language plpgsql
immutable
as $$
declare
  sanitized_url text;
  matches text[];
begin
  if asset_url is null or btrim(asset_url) = '' then
    return null;
  end if;

  sanitized_url := split_part(asset_url, '?', 1);
  matches := regexp_match(sanitized_url, '/storage/v1/object/public/([^/]+)/(.+)$');

  if matches is null or array_length(matches, 1) < 2 then
    return null;
  end if;

  if matches[1] <> expected_bucket then
    return null;
  end if;

  return matches[2];
end;
$$;

create or replace function public.delete_work_entry_storage_asset(asset_url text, expected_bucket text default 'work-images')
returns void
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  object_name text;
begin
  object_name := public.storage_object_name_from_public_url(asset_url, expected_bucket);

  if object_name is null then
    return;
  end if;

  delete from storage.objects
  where bucket_id = expected_bucket
    and name = object_name;
end;
$$;

create or replace function public.cleanup_work_entry_storage_assets()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  if tg_op = 'DELETE' then
    perform public.delete_work_entry_storage_asset(old.image_url);
    perform public.delete_work_entry_storage_asset(old.audio_url);
    return old;
  end if;

  if new.image_url is distinct from old.image_url then
    perform public.delete_work_entry_storage_asset(old.image_url);
  end if;

  if new.audio_url is distinct from old.audio_url then
    perform public.delete_work_entry_storage_asset(old.audio_url);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cleanup_work_entry_storage_assets on public.work_entries;

create trigger trg_cleanup_work_entry_storage_assets
after update or delete on public.work_entries
for each row
execute function public.cleanup_work_entry_storage_assets();

delete from storage.objects as so
where so.bucket_id = 'work-images'
  and not exists (
    select 1
    from public.work_entries we
    where public.storage_object_name_from_public_url(we.image_url) = so.name
       or public.storage_object_name_from_public_url(we.audio_url) = so.name
  );
