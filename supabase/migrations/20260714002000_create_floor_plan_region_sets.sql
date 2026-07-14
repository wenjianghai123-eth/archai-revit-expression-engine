create table if not exists public.floor_plan_region_sets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id text not null references public.image_assets(id) on delete cascade,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  regions jsonb not null default '[]'::jsonb,
  overlay_asset_id text references public.image_assets(id) on delete set null,
  status text not null default 'recognized' check (status in ('recognized', 'confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists floor_plan_region_sets_user_source_updated_idx
  on public.floor_plan_region_sets(user_id, source_asset_id, updated_at desc);

alter table public.floor_plan_region_sets enable row level security;

create policy "Users can read own floor plan region sets"
  on public.floor_plan_region_sets for select
  using (auth.uid() = user_id);

create policy "Users can insert own floor plan region sets"
  on public.floor_plan_region_sets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own floor plan region sets"
  on public.floor_plan_region_sets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

select pg_notify('pgrst', 'reload schema');
