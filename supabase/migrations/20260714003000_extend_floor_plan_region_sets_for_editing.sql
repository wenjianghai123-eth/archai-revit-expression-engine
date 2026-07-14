alter table public.floor_plan_region_sets
  add column if not exists auto_regions jsonb not null default '[]'::jsonb,
  add column if not exists version_number integer not null default 1,
  add column if not exists base_region_set_id text references public.floor_plan_region_sets(id) on delete set null,
  add column if not exists locked_at timestamptz;

update public.floor_plan_region_sets
set auto_regions = regions
where auto_regions = '[]'::jsonb;

create index if not exists floor_plan_region_sets_user_source_version_idx
  on public.floor_plan_region_sets(user_id, source_asset_id, version_number desc);

create index if not exists floor_plan_region_sets_base_idx
  on public.floor_plan_region_sets(base_region_set_id);

select pg_notify('pgrst', 'reload schema');
