create table if not exists public.floor_plan_region_materials (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  region_set_id text not null references public.floor_plan_region_sets(id) on delete cascade,
  region_id text not null,
  material_asset_id text references public.image_assets(id) on delete set null,
  material_name text not null default '',
  scale numeric not null default 1 check (scale >= 0.1 and scale <= 20),
  rotation numeric not null default 0 check (rotation >= -360 and rotation <= 360),
  direction text not null default 'auto' check (direction in ('auto', 'horizontal', 'vertical', 'diagonal')),
  joint_mode text not null default 'subtle' check (joint_mode in ('subtle', 'visible', 'none')),
  fallback_mode text not null default 'ai-auto' check (fallback_mode in ('reference', 'default', 'ai-auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(region_set_id, region_id)
);

create index if not exists floor_plan_region_materials_user_set_idx
  on public.floor_plan_region_materials(user_id, region_set_id);

create index if not exists floor_plan_region_materials_asset_idx
  on public.floor_plan_region_materials(material_asset_id)
  where material_asset_id is not null;

alter table public.floor_plan_region_materials enable row level security;

create policy "Users can read own floor plan region materials"
  on public.floor_plan_region_materials for select
  using (auth.uid() = user_id);

create policy "Users can insert own floor plan region materials"
  on public.floor_plan_region_materials for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plan_region_sets region_set
      where region_set.id = region_set_id and region_set.user_id = auth.uid()
    )
    and (
      material_asset_id is null
      or exists (
        select 1 from public.image_assets asset
        where asset.id = material_asset_id and asset.user_id = auth.uid()
      )
    )
  );

create policy "Users can update own floor plan region materials"
  on public.floor_plan_region_materials for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plan_region_sets region_set
      where region_set.id = region_set_id and region_set.user_id = auth.uid()
    )
    and (
      material_asset_id is null
      or exists (
        select 1 from public.image_assets asset
        where asset.id = material_asset_id and asset.user_id = auth.uid()
      )
    )
  );

select pg_notify('pgrst', 'reload schema');
