# Supabase Setup

This document describes the Supabase tables required by `SupabaseStorageAdapter`.

## Environment

Local development should continue to use JSON storage:

```bash
DATA_BACKEND=json
AUTH_MODE=dev
```

Production storage can use Supabase:

```bash
DATA_BACKEND=supabase
AUTH_MODE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key
```

`SUPABASE_SERVICE_ROLE_KEY` is backend-only. Do not expose it in frontend code or client-visible config.

## Tables

Run this SQL in the Supabase SQL editor.

```sql
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
  filename text not null,
  original_filename text not null,
  file_type text not null check (file_type in ('glb', 'gltf', 'obj')),
  mime_type text not null,
  size integer not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.generation_jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null check (mode in ('floorplan', 'style-render', 'inpaint')),
  prompt text not null,
  config jsonb not null default '{}'::jsonb,
  input_asset_ids text[] not null default '{}'::text[],
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress integer not null default 0,
  provider text not null,
  output_asset_id text references public.image_assets(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.generation_records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null check (mode in ('floorplan', 'style-render', 'inpaint')),
  prompt text not null,
  input_image_url text,
  input_image_data_preview text,
  output_image_url text,
  output_image_data_preview text,
  provider text not null,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  type text not null check (type in ('grant', 'debit', 'refund')),
  amount integer not null,
  balance_after integer not null,
  reason text not null,
  reference_type text check (reference_type in ('generation_job', 'system')),
  reference_id text,
  created_at timestamptz not null default now()
);
```

## Indexes

```sql
create index if not exists projects_user_id_created_at_idx
  on public.projects (user_id, created_at desc)
  where deleted_at is null;

create index if not exists image_assets_user_id_created_at_idx
  on public.image_assets (user_id, created_at desc);

create index if not exists model_assets_user_id_created_at_idx
  on public.model_assets (user_id, created_at desc)
  where deleted_at is null;

create index if not exists generation_jobs_status_created_at_idx
  on public.generation_jobs (status, created_at asc);

create index if not exists generation_jobs_user_id_created_at_idx
  on public.generation_jobs (user_id, created_at desc);

create index if not exists generation_records_project_user_created_at_idx
  on public.generation_records (project_id, user_id, created_at desc);

create index if not exists share_links_token_idx
  on public.share_links (token);

create index if not exists share_links_project_id_created_at_idx
  on public.share_links (project_id, created_at desc);

create index if not exists credit_transactions_user_id_created_at_idx
  on public.credit_transactions (user_id, created_at desc);

create index if not exists credit_transactions_user_ref_idx
  on public.credit_transactions (user_id, type, reference_id);
```

## Row Level Security

The current backend uses `SUPABASE_SERVICE_ROLE_KEY`, so it bypasses RLS and applies user filtering inside the `StorageAdapter`. You can still enable RLS before exposing direct client access, but direct frontend table access is not used by this app.

If you later add direct Supabase table reads from the browser, add RLS policies that restrict every table by `auth.uid() = user_id`.
