-- Supabase schema alignment for ArchAI Expression Engine.
-- Safe to run more than once on existing Supabase projects.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.image_assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  filename text not null,
  mime_type text not null,
  size integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.model_assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  preview_url text,
  optimized_url text,
  thumbnail_url text,
  filename text not null,
  original_filename text not null,
  file_type text not null check (file_type in ('glb', 'gltf', 'obj', 'dae', 'stl', 'zip')),
  mime_type text not null,
  size integer not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.generation_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null check (mode in ('floorplan', 'style-render', 'inpaint', 'model-render', 'design-variants', 'material-replace', 'plan-colorize', 'panorama-roam-render')),
  step text,
  batch_group_id text,
  prompt text not null,
  config jsonb not null default '{}'::jsonb,
  input_asset_ids text[] not null default '{}'::text[],
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout')),
  progress integer not null default 0,
  provider text not null,
  model text,
  provider_job_id text,
  source_job_id text,
  source_image_asset_id text,
  source_model_asset_id text,
  snapshot_asset_id text,
  output_asset_id text references public.image_assets(id) on delete set null,
  output_asset_ids text[] not null default '{}'::text[],
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  credit_cost integer not null default 0,
  credit_refunded boolean not null default false,
  failure_reason text
);

create table if not exists public.generation_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  job_id text references public.generation_jobs(id) on delete set null,
  mode text not null check (mode in ('floorplan', 'style-render', 'inpaint', 'model-render', 'design-variants', 'material-replace', 'plan-colorize', 'panorama-roam-render')),
  step text,
  batch_group_id text,
  prompt text not null,
  config jsonb not null default '{}'::jsonb,
  input_asset_ids text[] not null default '{}'::text[],
  output_asset_ids text[] not null default '{}'::text[],
  input_image_url text,
  input_image_data_preview text,
  output_image_url text,
  output_image_data_preview text,
  provider text not null,
  model text,
  source_job_id text,
  source_image_asset_id text,
  source_model_asset_id text,
  snapshot_asset_id text,
  model_snapshot_metadata jsonb,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_results (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  job_id text not null references public.generation_jobs(id) on delete cascade,
  asset_id text not null references public.image_assets(id) on delete cascade,
  image_url text not null,
  is_selected boolean not null default false,
  is_favorite boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  generation_step text not null,
  feature text,
  feature_name text,
  prompt text not null default '',
  negative_prompt text,
  config jsonb not null default '{}'::jsonb,
  input_asset_ids jsonb not null default '[]'::jsonb,
  reference_asset_ids jsonb not null default '[]'::jsonb,
  material_asset_ids jsonb not null default '[]'::jsonb,
  source_asset_id text,
  placement_preview_asset_id text,
  output_asset_id text,
  output_url text,
  preview_asset_id text,
  tags jsonb not null default '[]'::jsonb,
  is_public boolean not null default true,
  created_by uuid,
  created_from_generation_record_id text,
  created_from_job_id text,
  input_previews jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prompt_templates_generation_step
  on public.prompt_templates(generation_step);

create index if not exists idx_prompt_templates_created_at
  on public.prompt_templates(created_at desc);

create table if not exists public.share_links (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  token text not null unique,
  permission text not null default 'view' check (permission in ('view')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('grant', 'debit', 'refund', 'generate_charge', 'generate_refund', 'admin_grant')),
  amount integer not null,
  balance_after integer not null,
  reason text not null,
  reference_type text check (reference_type in ('generation_job', 'video_job', 'system')),
  reference_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.video_assets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  filename text not null,
  mime_type text not null,
  size integer not null,
  duration_seconds numeric,
  thumbnail_image_asset_id text references public.image_assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.video_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null default 'image-to-video',
  step text,
  prompt text not null,
  config jsonb not null default '{}'::jsonb,
  input_image_asset_id text references public.image_assets(id) on delete set null,
  input_asset_ids text[] not null default '{}'::text[],
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout')),
  progress integer not null default 0,
  provider text not null,
  model text,
  provider_job_id text,
  source_job_id text,
  output_video_asset_id text references public.video_assets(id) on delete set null,
  output_asset_ids text[] not null default '{}'::text[],
  thumbnail_image_asset_id text references public.image_assets(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  credit_cost integer not null default 0,
  credit_refunded boolean not null default false,
  failure_reason text
);

alter table public.projects
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists name text,
  add column if not exists description text not null default '',
  add column if not exists status text not null default 'active',
  add column if not exists cover_image_url text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.image_assets
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists url text,
  add column if not exists filename text,
  add column if not exists mime_type text,
  add column if not exists size integer,
  add column if not exists created_at timestamptz not null default now();

alter table public.model_assets
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists url text,
  add column if not exists preview_url text,
  add column if not exists optimized_url text,
  add column if not exists thumbnail_url text,
  add column if not exists filename text,
  add column if not exists original_filename text,
  add column if not exists file_type text,
  add column if not exists mime_type text,
  add column if not exists size integer,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

alter table public.generation_jobs
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists project_id text references public.projects(id) on delete cascade,
  add column if not exists mode text not null default 'floorplan',
  add column if not exists step text,
  add column if not exists batch_group_id text,
  add column if not exists prompt text not null default '',
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists input_asset_ids text[] not null default '{}'::text[],
  add column if not exists status text not null default 'queued',
  add column if not exists progress integer not null default 0,
  add column if not exists provider text not null default 'mock',
  add column if not exists model text,
  add column if not exists provider_job_id text,
  add column if not exists source_job_id text,
  add column if not exists source_image_asset_id text,
  add column if not exists source_model_asset_id text,
  add column if not exists snapshot_asset_id text,
  add column if not exists output_asset_id text references public.image_assets(id) on delete set null,
  add column if not exists output_asset_ids text[] not null default '{}'::text[],
  add column if not exists error_message text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists credit_cost integer not null default 0,
  add column if not exists credit_refunded boolean not null default false,
  add column if not exists failure_reason text;

alter table public.generation_records
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists project_id text references public.projects(id) on delete cascade,
  add column if not exists job_id text references public.generation_jobs(id) on delete set null,
  add column if not exists mode text not null default 'floorplan',
  add column if not exists step text,
  add column if not exists batch_group_id text,
  add column if not exists prompt text not null default '',
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists input_asset_ids text[] not null default '{}'::text[],
  add column if not exists output_asset_ids text[] not null default '{}'::text[],
  add column if not exists input_image_url text,
  add column if not exists input_image_data_preview text,
  add column if not exists output_image_url text,
  add column if not exists output_image_data_preview text,
  add column if not exists provider text not null default 'mock',
  add column if not exists model text,
  add column if not exists source_job_id text,
  add column if not exists source_image_asset_id text,
  add column if not exists source_model_asset_id text,
  add column if not exists snapshot_asset_id text,
  add column if not exists model_snapshot_metadata jsonb,
  add column if not exists status text not null default 'succeeded',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.generation_results
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists project_id text references public.projects(id) on delete cascade,
  add column if not exists job_id text references public.generation_jobs(id) on delete cascade,
  add column if not exists asset_id text references public.image_assets(id) on delete cascade,
  add column if not exists image_url text,
  add column if not exists is_selected boolean not null default false,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.credit_balances
  add column if not exists balance integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.credit_transactions
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists type text,
  add column if not exists amount integer,
  add column if not exists balance_after integer,
  add column if not exists reason text not null default '',
  add column if not exists reference_type text,
  add column if not exists reference_id text,
  add column if not exists created_at timestamptz not null default now();

alter table public.video_jobs
  add column if not exists step text,
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists input_asset_ids text[] not null default '{}'::text[],
  add column if not exists model text,
  add column if not exists provider_job_id text,
  add column if not exists source_job_id text,
  add column if not exists output_asset_ids text[] not null default '{}'::text[],
  add column if not exists credit_cost integer not null default 0,
  add column if not exists credit_refunded boolean not null default false,
  add column if not exists failure_reason text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'credit_transactions'
      and column_name = 'id'
      and data_type <> 'text'
  ) then
    alter table public.credit_transactions
      alter column id type text using id::text;
  end if;
end $$;

update public.generation_jobs
set
  step = coalesce(step, config->>'step'),
  batch_group_id = coalesce(batch_group_id, config->>'batchGroupId'),
  source_image_asset_id = coalesce(source_image_asset_id, config->>'sourceImageAssetId'),
  source_model_asset_id = coalesce(source_model_asset_id, config->>'sourceModelAssetId'),
  snapshot_asset_id = coalesce(snapshot_asset_id, config->>'snapshotAssetId')
where config is not null;

update public.generation_records
set
  step = coalesce(step, config->>'step'),
  batch_group_id = coalesce(batch_group_id, config->>'batchGroupId'),
  source_image_asset_id = coalesce(source_image_asset_id, config->>'sourceImageAssetId'),
  source_model_asset_id = coalesce(source_model_asset_id, config->>'sourceModelAssetId'),
  snapshot_asset_id = coalesce(snapshot_asset_id, config->>'snapshotAssetId'),
  model_snapshot_metadata = coalesce(model_snapshot_metadata, config->'modelSnapshotMetadata')
where config is not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%step%'
  loop
    execute format('alter table public.generation_jobs drop constraint %I', constraint_name);
  end loop;

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_records'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%step%'
  loop
    execute format('alter table public.generation_records drop constraint %I', constraint_name);
  end loop;
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%mode%'
  loop
    execute format('alter table public.generation_jobs drop constraint %I', constraint_name);
  end loop;

  alter table public.generation_jobs
    add constraint generation_jobs_mode_check
    check (mode in ('floorplan', 'style-render', 'inpaint', 'model-render', 'design-variants', 'material-replace', 'plan-colorize', 'panorama-roam-render'));

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_records'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%mode%'
  loop
    execute format('alter table public.generation_records drop constraint %I', constraint_name);
  end loop;

  alter table public.generation_records
    add constraint generation_records_mode_check
    check (mode in ('floorplan', 'style-render', 'inpaint', 'model-render', 'design-variants', 'material-replace', 'plan-colorize', 'panorama-roam-render'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_jobs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.generation_jobs drop constraint %I', constraint_name);
  end loop;

  alter table public.generation_jobs
    add constraint generation_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timeout'));

  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.generation_records'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.generation_records drop constraint %I', constraint_name);
  end loop;

  alter table public.generation_records
    add constraint generation_records_status_check
    check (status in ('succeeded', 'failed'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.credit_transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.credit_transactions drop constraint %I', constraint_name);
  end loop;

  alter table public.credit_transactions
    add constraint credit_transactions_type_check
    check (type in ('grant', 'debit', 'refund', 'generate_charge', 'generate_refund', 'admin_grant'));

  alter table public.credit_transactions
    add constraint credit_transactions_reference_type_check
    check (reference_type is null or reference_type in ('generation_job', 'video_job', 'system'));
end $$;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.model_assets'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%file_type%'
  loop
    execute format('alter table public.model_assets drop constraint %I', constraint_name);
  end loop;

  alter table public.model_assets
    add constraint model_assets_file_type_check
    check (file_type in ('glb', 'gltf', 'obj', 'dae', 'stl', 'zip'));
end $$;

create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc)
  where deleted_at is null;

create index if not exists profiles_role_status_idx
  on public.profiles (role, status);

create index if not exists image_assets_user_id_created_at_idx
  on public.image_assets (user_id, created_at desc);

create index if not exists model_assets_user_id_created_at_idx
  on public.model_assets (user_id, created_at desc)
  where deleted_at is null;

create index if not exists generation_jobs_status_created_at_idx
  on public.generation_jobs (status, created_at asc);

create index if not exists generation_jobs_user_id_created_at_idx
  on public.generation_jobs (user_id, created_at desc);

create index if not exists generation_jobs_project_user_created_at_idx
  on public.generation_jobs (project_id, user_id, created_at desc);

create index if not exists generation_jobs_batch_group_id_idx
  on public.generation_jobs (batch_group_id)
  where batch_group_id is not null;

create index if not exists generation_records_project_user_created_at_idx
  on public.generation_records (project_id, user_id, created_at desc);

create index if not exists generation_records_job_id_idx
  on public.generation_records (job_id);

create index if not exists generation_records_batch_group_id_idx
  on public.generation_records (batch_group_id)
  where batch_group_id is not null;

create index if not exists generation_results_job_user_created_at_idx
  on public.generation_results (job_id, user_id, created_at asc);

create index if not exists generation_results_project_user_created_at_idx
  on public.generation_results (project_id, user_id, created_at desc);

create index if not exists generation_results_asset_id_idx
  on public.generation_results (asset_id);

create index if not exists share_links_token_idx
  on public.share_links (token);

create index if not exists share_links_project_id_created_at_idx
  on public.share_links (project_id, created_at desc);

create index if not exists credit_transactions_user_id_created_at_idx
  on public.credit_transactions (user_id, created_at desc);

create index if not exists credit_transactions_user_ref_idx
  on public.credit_transactions (user_id, type, reference_id);

create unique index if not exists credit_transactions_user_type_reference_unique_idx
  on public.credit_transactions (user_id, type, reference_id)
  where reference_id is not null;

create index if not exists video_assets_user_id_created_at_idx
  on public.video_assets (user_id, created_at desc);

create index if not exists video_jobs_status_created_at_idx
  on public.video_jobs (status, created_at asc);

create index if not exists video_jobs_user_id_created_at_idx
  on public.video_jobs (user_id, created_at desc);

create index if not exists video_jobs_project_user_created_at_idx
  on public.video_jobs (project_id, user_id, created_at desc);

create or replace function public.adjust_credits_atomic(
  p_user_id uuid,
  p_type text,
  p_amount integer,
  p_reason text,
  p_reference_type text default null,
  p_reference_id text default null
)
returns table (
  balance_user_id uuid,
  balance integer,
  balance_updated_at timestamptz,
  transaction_id text,
  transaction_user_id uuid,
  transaction_type text,
  transaction_amount integer,
  transaction_balance_after integer,
  transaction_reason text,
  transaction_reference_type text,
  transaction_reference_id text,
  transaction_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance public.credit_balances%rowtype;
  v_transaction public.credit_transactions%rowtype;
  v_next_balance integer;
  v_now timestamptz := now();
begin
  if p_type not in ('grant', 'debit', 'refund', 'generate_charge', 'generate_refund', 'admin_grant') then
    raise exception 'Invalid credit transaction type: %', p_type;
  end if;

  if p_reference_type is not null and p_reference_type not in ('generation_job', 'video_job', 'system') then
    raise exception 'Invalid credit reference type: %', p_reference_type;
  end if;

  if p_amount = 0 then
    raise exception 'Credit adjustment amount cannot be zero.';
  end if;

  if p_type in ('debit', 'generate_charge') and p_amount >= 0 then
    raise exception 'Debit amount must be negative.';
  end if;

  if p_type in ('grant', 'refund', 'generate_refund', 'admin_grant') and p_amount <= 0 then
    raise exception 'Grant and refund amounts must be positive.';
  end if;

  insert into public.credit_balances (user_id, balance, updated_at)
  values (p_user_id, 0, v_now)
  on conflict (user_id) do nothing;

  select *
    into v_balance
    from public.credit_balances
    where user_id = p_user_id
    for update;

  if p_reference_id is not null then
    select *
      into v_transaction
      from public.credit_transactions
      where user_id = p_user_id
        and type = p_type
        and reference_id = p_reference_id;

    if found then
      return query
      select
        v_balance.user_id,
        v_balance.balance,
        v_balance.updated_at,
        v_transaction.id,
        v_transaction.user_id,
        v_transaction.type,
        v_transaction.amount,
        v_transaction.balance_after,
        v_transaction.reason,
        v_transaction.reference_type,
        v_transaction.reference_id,
        v_transaction.created_at;
      return;
    end if;
  end if;

  v_next_balance := v_balance.balance + p_amount;

  if v_next_balance < 0 then
    return;
  end if;

  update public.credit_balances
    set balance = v_next_balance,
        updated_at = v_now
    where user_id = p_user_id
    returning * into v_balance;

  insert into public.credit_transactions (
    id,
    user_id,
    type,
    amount,
    balance_after,
    reason,
    reference_type,
    reference_id,
    created_at
  )
  values (
    'credit_tx_' || gen_random_uuid()::text,
    p_user_id,
    p_type,
    p_amount,
    v_next_balance,
    p_reason,
    p_reference_type,
    p_reference_id,
    v_now
  )
  returning * into v_transaction;

  return query
  select
    v_balance.user_id,
    v_balance.balance,
    v_balance.updated_at,
    v_transaction.id,
    v_transaction.user_id,
    v_transaction.type,
    v_transaction.amount,
    v_transaction.balance_after,
    v_transaction.reason,
    v_transaction.reference_type,
    v_transaction.reference_id,
    v_transaction.created_at;
end;
$$;

revoke all on function public.adjust_credits_atomic(uuid, text, integer, text, text, text) from public;
grant execute on function public.adjust_credits_atomic(uuid, text, integer, text, text, text) to service_role;

select pg_notify('pgrst', 'reload schema');
