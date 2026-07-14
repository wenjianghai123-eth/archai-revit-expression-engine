begin;

-- Consolidated, non-destructive repair for deployments where the earlier
-- floor-plan migrations were not applied or were only partially applied.
create table if not exists public.floor_plan_region_sets (
  id text constraint floor_plan_region_sets_pkey primary key,
  user_id uuid not null constraint floor_plan_region_sets_user_id_fkey references auth.users(id) on delete cascade,
  source_asset_id text not null constraint floor_plan_region_sets_source_asset_id_fkey references public.image_assets(id) on delete cascade,
  width integer not null constraint floor_plan_region_sets_width_check check (width > 0),
  height integer not null constraint floor_plan_region_sets_height_check check (height > 0),
  regions jsonb not null default '[]'::jsonb,
  auto_regions jsonb not null default '[]'::jsonb,
  overlay_asset_id text constraint floor_plan_region_sets_overlay_asset_id_fkey references public.image_assets(id) on delete set null,
  status text not null default 'recognized' constraint floor_plan_region_sets_status_check check (status in ('recognized', 'confirmed')),
  version_number integer not null default 1 constraint floor_plan_region_sets_version_number_check check (version_number > 0),
  base_region_set_id text constraint floor_plan_region_sets_base_region_set_id_fkey references public.floor_plan_region_sets(id) on delete set null,
  locked_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not repair a partially-created table.
alter table public.floor_plan_region_sets
  add column if not exists id text,
  add column if not exists user_id uuid,
  add column if not exists source_asset_id text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists regions jsonb default '[]'::jsonb,
  add column if not exists auto_regions jsonb default '[]'::jsonb,
  add column if not exists overlay_asset_id text,
  add column if not exists status text default 'recognized',
  add column if not exists version_number integer default 1,
  add column if not exists base_region_set_id text,
  add column if not exists locked_at timestamptz,
  add column if not exists confirmed_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.floor_plan_region_sets
set
  regions = coalesce(regions, '[]'::jsonb),
  auto_regions = coalesce(auto_regions, regions, '[]'::jsonb),
  status = coalesce(status, 'recognized'),
  version_number = coalesce(version_number, 1),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where regions is null
   or auto_regions is null
   or status is null
   or version_number is null
   or created_at is null
   or updated_at is null;

do $$
begin
  if exists (
    select 1 from public.floor_plan_region_sets
    where id is null or user_id is null or source_asset_id is null or width is null or height is null
  ) then
    raise exception 'floor_plan_region_sets contains rows missing required identity, owner, source asset, width, or height; repair those rows before applying NOT NULL constraints';
  end if;
end
$$;

alter table public.floor_plan_region_sets
  alter column id set not null,
  alter column user_id set not null,
  alter column source_asset_id set not null,
  alter column width set not null,
  alter column height set not null,
  alter column regions set default '[]'::jsonb,
  alter column regions set not null,
  alter column auto_regions set default '[]'::jsonb,
  alter column auto_regions set not null,
  alter column status set default 'recognized',
  alter column status set not null,
  alter column version_number set default 1,
  alter column version_number set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.floor_plan_region_sets'::regclass and contype = 'p'
  ) then
    alter table public.floor_plan_region_sets
      add constraint floor_plan_region_sets_pkey primary key (id);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_user_id_fkey') then
    alter table public.floor_plan_region_sets
      add constraint floor_plan_region_sets_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_source_asset_id_fkey') then
    alter table public.floor_plan_region_sets
      add constraint floor_plan_region_sets_source_asset_id_fkey foreign key (source_asset_id) references public.image_assets(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_overlay_asset_id_fkey') then
    alter table public.floor_plan_region_sets
      add constraint floor_plan_region_sets_overlay_asset_id_fkey foreign key (overlay_asset_id) references public.image_assets(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_base_region_set_id_fkey') then
    alter table public.floor_plan_region_sets
      add constraint floor_plan_region_sets_base_region_set_id_fkey foreign key (base_region_set_id) references public.floor_plan_region_sets(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_width_check') then
    alter table public.floor_plan_region_sets add constraint floor_plan_region_sets_width_check check (width > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_height_check') then
    alter table public.floor_plan_region_sets add constraint floor_plan_region_sets_height_check check (height > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_status_check') then
    alter table public.floor_plan_region_sets add constraint floor_plan_region_sets_status_check check (status in ('recognized', 'confirmed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_sets'::regclass and conname = 'floor_plan_region_sets_version_number_check') then
    alter table public.floor_plan_region_sets add constraint floor_plan_region_sets_version_number_check check (version_number > 0) not valid;
  end if;
end
$$;

create index if not exists floor_plan_region_sets_user_source_updated_idx
  on public.floor_plan_region_sets(user_id, source_asset_id, updated_at desc);
create index if not exists floor_plan_region_sets_user_source_version_idx
  on public.floor_plan_region_sets(user_id, source_asset_id, version_number desc);
create index if not exists floor_plan_region_sets_base_idx
  on public.floor_plan_region_sets(base_region_set_id);

create table if not exists public.floor_plan_region_materials (
  id text constraint floor_plan_region_materials_pkey primary key,
  user_id uuid not null constraint floor_plan_region_materials_user_id_fkey references auth.users(id) on delete cascade,
  region_set_id text not null constraint floor_plan_region_materials_region_set_id_fkey references public.floor_plan_region_sets(id) on delete cascade,
  region_id text not null,
  material_asset_id text constraint floor_plan_region_materials_material_asset_id_fkey references public.image_assets(id) on delete set null,
  material_name text not null default '',
  scale numeric not null default 1 constraint floor_plan_region_materials_scale_check check (scale >= 0.1 and scale <= 20),
  rotation numeric not null default 0 constraint floor_plan_region_materials_rotation_check check (rotation >= -360 and rotation <= 360),
  direction text not null default 'auto' constraint floor_plan_region_materials_direction_check check (direction in ('auto', 'horizontal', 'vertical', 'diagonal')),
  joint_mode text not null default 'subtle' constraint floor_plan_region_materials_joint_mode_check check (joint_mode in ('subtle', 'visible', 'none')),
  fallback_mode text not null default 'ai-auto' constraint floor_plan_region_materials_fallback_mode_check check (fallback_mode in ('reference', 'default', 'ai-auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint floor_plan_region_materials_region_set_id_region_id_key unique(region_set_id, region_id)
);

alter table public.floor_plan_region_materials
  add column if not exists id text,
  add column if not exists user_id uuid,
  add column if not exists region_set_id text,
  add column if not exists region_id text,
  add column if not exists material_asset_id text,
  add column if not exists material_name text default '',
  add column if not exists scale numeric default 1,
  add column if not exists rotation numeric default 0,
  add column if not exists direction text default 'auto',
  add column if not exists joint_mode text default 'subtle',
  add column if not exists fallback_mode text default 'ai-auto',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.floor_plan_region_materials
set
  material_name = coalesce(material_name, ''),
  scale = coalesce(scale, 1),
  rotation = coalesce(rotation, 0),
  direction = coalesce(direction, 'auto'),
  joint_mode = coalesce(joint_mode, 'subtle'),
  fallback_mode = coalesce(fallback_mode, 'ai-auto'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, created_at, now())
where material_name is null
   or scale is null
   or rotation is null
   or direction is null
   or joint_mode is null
   or fallback_mode is null
   or created_at is null
   or updated_at is null;

do $$
begin
  if exists (
    select 1 from public.floor_plan_region_materials
    where id is null or user_id is null or region_set_id is null or region_id is null
  ) then
    raise exception 'floor_plan_region_materials contains rows missing required identity, owner, region set, or region id; repair those rows before applying NOT NULL constraints';
  end if;
end
$$;

alter table public.floor_plan_region_materials
  alter column id set not null,
  alter column user_id set not null,
  alter column region_set_id set not null,
  alter column region_id set not null,
  alter column material_name set default '',
  alter column material_name set not null,
  alter column scale set default 1,
  alter column scale set not null,
  alter column rotation set default 0,
  alter column rotation set not null,
  alter column direction set default 'auto',
  alter column direction set not null,
  alter column joint_mode set default 'subtle',
  alter column joint_mode set not null,
  alter column fallback_mode set default 'ai-auto',
  alter column fallback_mode set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.floor_plan_region_materials'::regclass and contype = 'p'
  ) then
    alter table public.floor_plan_region_materials
      add constraint floor_plan_region_materials_pkey primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_user_id_fkey') then
    alter table public.floor_plan_region_materials
      add constraint floor_plan_region_materials_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_region_set_id_fkey') then
    alter table public.floor_plan_region_materials
      add constraint floor_plan_region_materials_region_set_id_fkey foreign key (region_set_id) references public.floor_plan_region_sets(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_material_asset_id_fkey') then
    alter table public.floor_plan_region_materials
      add constraint floor_plan_region_materials_material_asset_id_fkey foreign key (material_asset_id) references public.image_assets(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_region_set_id_region_id_key') then
    alter table public.floor_plan_region_materials
      add constraint floor_plan_region_materials_region_set_id_region_id_key unique (region_set_id, region_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_scale_check') then
    alter table public.floor_plan_region_materials add constraint floor_plan_region_materials_scale_check check (scale >= 0.1 and scale <= 20) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_rotation_check') then
    alter table public.floor_plan_region_materials add constraint floor_plan_region_materials_rotation_check check (rotation >= -360 and rotation <= 360) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_direction_check') then
    alter table public.floor_plan_region_materials add constraint floor_plan_region_materials_direction_check check (direction in ('auto', 'horizontal', 'vertical', 'diagonal')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_joint_mode_check') then
    alter table public.floor_plan_region_materials add constraint floor_plan_region_materials_joint_mode_check check (joint_mode in ('subtle', 'visible', 'none')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.floor_plan_region_materials'::regclass and conname = 'floor_plan_region_materials_fallback_mode_check') then
    alter table public.floor_plan_region_materials add constraint floor_plan_region_materials_fallback_mode_check check (fallback_mode in ('reference', 'default', 'ai-auto')) not valid;
  end if;
end
$$;

create index if not exists floor_plan_region_materials_user_set_idx
  on public.floor_plan_region_materials(user_id, region_set_id);
create index if not exists floor_plan_region_materials_asset_idx
  on public.floor_plan_region_materials(material_asset_id)
  where material_asset_id is not null;

alter table public.floor_plan_region_sets enable row level security;
alter table public.floor_plan_region_materials enable row level security;

-- SECURITY DEFINER avoids recursive RLS evaluation when a region-set policy
-- validates ownership of base_region_set_id on the same table.
create or replace function public.owns_floor_plan_region_set(target_region_set_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.floor_plan_region_sets region_set
    where region_set.id = target_region_set_id
      and region_set.user_id = auth.uid()
  );
$$;

revoke all on function public.owns_floor_plan_region_set(text) from public;
grant execute on function public.owns_floor_plan_region_set(text) to authenticated, service_role;

-- Replace the earlier permissive owner-only policies with ownership checks for
-- every referenced asset and parent region set. No DELETE policy is granted.
drop policy if exists "Users can read own floor plan region sets" on public.floor_plan_region_sets;
drop policy if exists "Users can insert own floor plan region sets" on public.floor_plan_region_sets;
drop policy if exists "Users can update own floor plan region sets" on public.floor_plan_region_sets;

create policy "Users can read own floor plan region sets"
  on public.floor_plan_region_sets for select
  using (auth.uid() = user_id);

create policy "Users can insert own floor plan region sets"
  on public.floor_plan_region_sets for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.image_assets source_asset
      where source_asset.id = source_asset_id and source_asset.user_id = auth.uid()
    )
    and (
      overlay_asset_id is null
      or exists (
        select 1 from public.image_assets overlay_asset
        where overlay_asset.id = overlay_asset_id and overlay_asset.user_id = auth.uid()
      )
    )
    and (
      base_region_set_id is null
      or public.owns_floor_plan_region_set(base_region_set_id)
    )
  );

create policy "Users can update own floor plan region sets"
  on public.floor_plan_region_sets for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.image_assets source_asset
      where source_asset.id = source_asset_id and source_asset.user_id = auth.uid()
    )
    and (
      overlay_asset_id is null
      or exists (
        select 1 from public.image_assets overlay_asset
        where overlay_asset.id = overlay_asset_id and overlay_asset.user_id = auth.uid()
      )
    )
    and (
      base_region_set_id is null
      or public.owns_floor_plan_region_set(base_region_set_id)
    )
  );

drop policy if exists "Users can read own floor plan region materials" on public.floor_plan_region_materials;
drop policy if exists "Users can insert own floor plan region materials" on public.floor_plan_region_materials;
drop policy if exists "Users can update own floor plan region materials" on public.floor_plan_region_materials;

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

grant select, insert, update on public.floor_plan_region_sets to authenticated;
grant select, insert, update on public.floor_plan_region_materials to authenticated;
grant all privileges on public.floor_plan_region_sets to service_role;
grant all privileges on public.floor_plan_region_materials to service_role;

select pg_notify('pgrst', 'reload schema');

commit;
