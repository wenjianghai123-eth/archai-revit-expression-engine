# Supabase Setup

This document describes the Supabase Auth, database, RPC, RLS, and Storage setup used by the current backend adapters.

The app does not use direct frontend table writes. The Express backend uses `SUPABASE_SERVICE_ROLE_KEY` for storage adapter writes and still performs project/asset/user checks in application code. RLS policies are included as a defense-in-depth baseline and for future browser read features.

## Environment

Local development should continue to use JSON storage:

```bash
DATA_BACKEND=json
AUTH_MODE=dev
```

Production storage can use Supabase. Keep frontend `VITE_*` variables and backend/runtime variables in the correct hosting service:

```bash
# Backend/runtime environment on the Express service:
DATA_BACKEND=supabase
AUTH_MODE=supabase
FILE_STORAGE=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_public_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_backend_only_service_role_key
SUPABASE_STORAGE_BUCKET=archai-assets

# Frontend build-time environment on Netlify/Vercel/static hosts:
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_public_anon_key
VITE_API_BASE_URL=https://your-api-domain.com
```

`SUPABASE_SERVICE_ROLE_KEY`, provider keys, `DATA_BACKEND`, `FILE_STORAGE`, and `AUTH_MODE` are backend-only. Do not expose them in frontend code or client-visible config. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_BASE_URL` are frontend build-time values and are expected to be visible in the browser bundle.

`VITE_*` variables are Vite build-time variables. After changing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or `VITE_API_BASE_URL`, rebuild and redeploy the frontend; changing only the server environment will not update already-built browser bundles.

If frontend and backend are deployed separately, such as Netlify static frontend plus Render/Railway backend, `VITE_API_BASE_URL` is required and must be set to the backend origin only, for example `https://api.example.com`. The frontend will call `${VITE_API_BASE_URL}/api/...`. If it is empty, the app calls same-origin `/api/...`, which only works for single-service deployments where Express serves both `dist` and `/api`.

For production deploys, put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend host's build-time environment settings. Backend-only variables such as `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GRSAI_API_KEY` are not injected into Vite browser code. After changing frontend env vars, run `npm run build` again and redeploy the frontend; restarting only the Express backend will not make the login page pick up new `VITE_*` values.

Production login uses an administrator-created account model. Do not expose a public sign-up UI, and disable or restrict public sign-ups in Supabase Authentication settings. The backend authorizes users through the `profiles` table, so a Supabase Auth user without an active profile cannot access business APIs.

Create the first admin with:

```bash
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_NAME="ArchAI Admin"
npm run seed:admin
```

The script does not print the password. After seeding, log in at `/admin` and create member accounts from the user management page.

## Auth

Use Supabase Auth when `AUTH_MODE=supabase`. The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to sign in with email and password, then attach Bearer tokens. Magic link login and public sign-up are intentionally not used. The backend validates tokens with the service role key.

For local mock development, keep `AUTH_MODE=dev`; no Supabase project is required.

## Tables

Run this SQL in the Supabase SQL editor.

```sql
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
  output_asset_ids text[] not null default '{}'::text[],
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
  job_id text references public.generation_jobs(id) on delete set null,
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

create table if not exists public.generation_results (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  job_id text not null references public.generation_jobs(id) on delete cascade,
  asset_id text not null references public.image_assets(id) on delete cascade,
  image_url text not null,
  is_selected boolean not null default false,
  is_favorite boolean not null default false,
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

If you are updating an older database, verify the code-to-SQL checklist at the end of this document. In particular, newer code requires `generation_results`, `generation_records.job_id`, and `generation_jobs.output_asset_ids`. `credit_transactions` must contain a single `id text primary key` column; do not duplicate the `id` column when merging older SQL snippets.

## Indexes

```sql
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

create index if not exists generation_records_project_user_created_at_idx
  on public.generation_records (project_id, user_id, created_at desc);

create index if not exists generation_records_job_id_idx
  on public.generation_records (job_id);

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
```

## Credit RPC

`SupabaseStorageAdapter.adjustCredits` uses this RPC so credit debits, grants, and refunds happen atomically inside the database. The function locks the user's `credit_balances` row, rejects insufficient debits, updates the balance, writes the transaction, and returns both records. Repeated calls with the same `user_id`, `type`, and `reference_id` return the existing transaction without changing the balance again.

```sql
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
  if p_type not in ('grant', 'debit', 'refund') then
    raise exception 'Invalid credit transaction type: %', p_type;
  end if;

  if p_reference_type is not null and p_reference_type not in ('generation_job', 'system') then
    raise exception 'Invalid credit reference type: %', p_reference_type;
  end if;

  if p_amount = 0 then
    raise exception 'Credit adjustment amount cannot be zero.';
  end if;

  if p_type = 'debit' and p_amount >= 0 then
    raise exception 'Debit amount must be negative.';
  end if;

  if p_type in ('grant', 'refund') and p_amount <= 0 then
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
```

## Row Level Security

The current backend uses `SUPABASE_SERVICE_ROLE_KEY`, so it bypasses RLS and applies user filtering inside the `StorageAdapter`. Direct frontend table access is not used by this app. The policies below keep the schema safe if a future browser feature reads through the anon key.

Run this SQL after creating the tables:

```sql
alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.image_assets enable row level security;
alter table public.model_assets enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.generation_records enable row level security;
alter table public.generation_results enable row level security;
alter table public.share_links enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_transactions enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own image assets"
  on public.image_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own image assets"
  on public.image_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can read own model assets"
  on public.model_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own model assets"
  on public.model_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own model assets"
  on public.model_assets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own generation jobs"
  on public.generation_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own generation jobs"
  on public.generation_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own generation jobs"
  on public.generation_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own generation records"
  on public.generation_records for select
  using (auth.uid() = user_id);

create policy "Users can insert own generation records"
  on public.generation_records for insert
  with check (auth.uid() = user_id);

create policy "Users can read own generation results"
  on public.generation_results for select
  using (auth.uid() = user_id);

create policy "Users can insert own generation results"
  on public.generation_results for insert
  with check (auth.uid() = user_id);

create policy "Users can update own generation results"
  on public.generation_results for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own share links"
  on public.share_links for select
  using (
    exists (
      select 1 from public.projects
      where projects.id = share_links.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert own share links"
  on public.share_links for insert
  with check (
    exists (
      select 1 from public.projects
      where projects.id = share_links.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own share links"
  on public.share_links for update
  using (
    exists (
      select 1 from public.projects
      where projects.id = share_links.project_id
        and projects.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects
      where projects.id = share_links.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Users can read own credit balance"
  on public.credit_balances for select
  using (auth.uid() = user_id);

create policy "Users can read own credit transactions"
  on public.credit_transactions for select
  using (auth.uid() = user_id);
```

The Express backend still performs writes through the service role key. Do not grant direct browser write access to credits; credits are adjusted only by server code.

## Supabase Storage

Supabase file storage is optional and only used when `FILE_STORAGE=supabase`.

1. Create a bucket named by `SUPABASE_STORAGE_BUCKET`, for example `archai-assets`.
2. The current app stores:
   - generated and uploaded images under `users/{userId}/images/...` when using Supabase Storage,
   - uploaded model assets under `users/{userId}/models/...`,
   - local storage uses `/uploads/...` paths instead.
3. The backend uploads and deletes files with `SUPABASE_SERVICE_ROLE_KEY`.
4. Generated image URLs are currently resolved with `getPublicUrl`, so the simplest MVP setup is a public bucket. If you need private buckets, add signed URL handling in `server/fileStorage.ts` before switching the bucket to private.

Example public bucket policy:

```sql
-- Run only if the bucket should be public for MVP previews.
insert into storage.buckets (id, name, public)
values ('archai-assets', 'archai-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read ArchAI assets"
  on storage.objects for select
  using (bucket_id = 'archai-assets');

create policy "Service role can manage ArchAI assets"
  on storage.objects for all
  to service_role
  using (bucket_id = 'archai-assets')
  with check (bucket_id = 'archai-assets');
```

Supabase's service role bypasses RLS for server-side operations. Do not put the service role key in Vite env vars or browser-visible config.

## Code-to-SQL Checklist

`SupabaseStorageAdapter` expects these table names and fields:

- `projects`: `id`, `user_id`, `name`, `description`, `status`, `cover_image_url`, `created_at`, `updated_at`, `deleted_at`
- `profiles`: `id`, `email`, `name`, `role`, `status`, `created_at`, `updated_at`
- `image_assets`: `id`, `user_id`, `url`, `filename`, `mime_type`, `size`, `created_at`
- `model_assets`: `id`, `user_id`, `url`, `filename`, `original_filename`, `file_type`, `mime_type`, `size`, `created_at`, `deleted_at`
- `generation_jobs`: `id`, `user_id`, `project_id`, `mode`, `prompt`, `config`, `input_asset_ids`, `status`, `progress`, `provider`, `output_asset_id`, `output_asset_ids`, `error_message`, `created_at`, `updated_at`, `started_at`, `finished_at`
- `generation_records`: `id`, `user_id`, `project_id`, `job_id`, `mode`, `prompt`, `input_image_url`, `input_image_data_preview`, `output_image_url`, `output_image_data_preview`, `provider`, `status`, `created_at`, `updated_at`
- `generation_results`: `id`, `user_id`, `project_id`, `job_id`, `asset_id`, `image_url`, `is_selected`, `is_favorite`, `created_at`, `updated_at`
- `share_links`: `id`, `project_id`, `token`, `permission`, `expires_at`, `created_at`, `revoked_at`
- `credit_balances`: `user_id`, `balance`, `updated_at`
- `credit_transactions`: `id`, `user_id`, `type`, `amount`, `balance_after`, `reason`, `reference_type`, `reference_id`, `created_at`

Generation job diagnostics are persisted inside `generation_jobs.config.__diagnostics` by the current adapter. A separate `diagnostics` column is not required for the SQL in this document.

Current role values are `admin` and `member` only. Do not create or migrate profile rows with a legacy `user` role value.

## Production Hardening Notes

This setup is enough for a developer to initialize Supabase and run the current app, but it is not a complete production operations plan.

- The in-process generation worker should be replaced or backed by a durable queue before serious production traffic.
- Add database backups, monitoring, alerting, provider health checks, and operational dashboards.
- Keep `ENABLE_LEGACY_GENERATION_ENDPOINTS=false` in production.
- Keep `ENABLE_PROVIDER_FALLBACK=false` in production if mock output must never be shown for failed real-provider jobs.
- Credits are atomic in Supabase through `adjust_credits_atomic`, but billing, payment, chargebacks, and subscription enforcement are not implemented.
- Consider private Supabase Storage plus signed URLs before storing sensitive client work.
