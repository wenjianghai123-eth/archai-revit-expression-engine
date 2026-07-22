-- Durable generation worker state for production Supabase deployments.
-- Safe for existing data: only nullable/defaulted columns, indexes, and RPCs are added.

alter table public.generation_jobs
  add column if not exists idempotency_key text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists execution_timeout_at timestamptz,
  add column if not exists provider_started_at timestamptz,
  add column if not exists provider_finished_at timestamptz,
  add column if not exists provider_duration_ms integer,
  add column if not exists last_error_code text,
  add column if not exists last_error_category text,
  add column if not exists last_error_retryable boolean;

alter table public.generation_results
  add column if not exists result_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'generation_jobs_attempt_count_nonnegative'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_attempt_count_nonnegative check (attempt_count >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'generation_jobs_max_attempts_positive'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_max_attempts_positive check (max_attempts > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'generation_jobs_provider_duration_nonnegative'
      and conrelid = 'public.generation_jobs'::regclass
  ) then
    alter table public.generation_jobs
      add constraint generation_jobs_provider_duration_nonnegative
      check (provider_duration_ms is null or provider_duration_ms >= 0);
  end if;
end
$$;

create unique index if not exists generation_jobs_user_idempotency_unique_idx
  on public.generation_jobs (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists generation_jobs_worker_claim_idx
  on public.generation_jobs (status, next_attempt_at, lease_expires_at, created_at);

create index if not exists generation_jobs_lease_owner_idx
  on public.generation_jobs (lease_owner, lease_expires_at)
  where lease_owner is not null;

create unique index if not exists generation_results_job_result_key_unique_idx
  on public.generation_results (job_id, result_key)
  where result_key is not null;

drop function if exists public.claim_generation_job(text, integer, integer);

create or replace function public.claim_generation_job(
  p_worker_id text,
  p_lease_seconds integer default 60,
  p_timeout_seconds integer default 600,
  p_job_id text default null
)
returns setof public.generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker id is required';
  end if;

  select *
    into v_job
    from public.generation_jobs
    where (p_job_id is null or id = p_job_id)
      and (
        (status = 'queued'
          and attempt_count < max_attempts
          and (next_attempt_at is null or next_attempt_at <= v_now))
        or
        (status = 'running'
          and attempt_count <= max_attempts
          and (lease_expires_at is null or lease_expires_at <= v_now))
      )
    order by created_at asc
    for update skip locked
    limit 1;

  if not found then
    return;
  end if;

  update public.generation_jobs
    set status = 'running',
        attempt_count = attempt_count + 1,
        lease_owner = trim(p_worker_id),
        lease_expires_at = v_now + make_interval(secs => greatest(1, p_lease_seconds)),
        heartbeat_at = v_now,
        execution_timeout_at = v_now + make_interval(secs => greatest(1, p_timeout_seconds)),
        next_attempt_at = null,
        started_at = coalesce(started_at, v_now),
        finished_at = null,
        updated_at = v_now
    where id = v_job.id
    returning * into v_job;

  return next v_job;
end;
$$;

create or replace function public.renew_generation_job_lease(
  p_job_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
  v_now timestamptz := clock_timestamp();
begin
  update public.generation_jobs
    set heartbeat_at = v_now,
        lease_expires_at = v_now + make_interval(secs => greatest(1, p_lease_seconds)),
        updated_at = v_now
    where id = p_job_id
      and status = 'running'
      and lease_owner = p_worker_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.refund_generation_job_once(p_job_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_debit public.credit_transactions%rowtype;
  v_refund public.credit_transactions%rowtype;
  v_balance public.credit_balances%rowtype;
  v_amount integer;
  v_now timestamptz := clock_timestamp();
begin
  select *
    into v_job
    from public.generation_jobs
    where id = p_job_id
    for update;

  if not found or v_job.status not in ('failed', 'cancelled', 'timeout') then
    return false;
  end if;

  select *
    into v_refund
    from public.credit_transactions
    where user_id = v_job.user_id
      and type in ('generate_refund', 'refund')
      and reference_id = v_job.id
    order by created_at asc
    limit 1;

  if found then
    update public.generation_jobs
      set credit_refunded = true, updated_at = v_now
      where id = v_job.id;
    return false;
  end if;

  select *
    into v_debit
    from public.credit_transactions
    where user_id = v_job.user_id
      and type in ('generate_charge', 'debit')
      and reference_id = v_job.id
      and amount < 0
    order by created_at asc
    limit 1;

  if not found then
    return false;
  end if;

  insert into public.credit_balances (user_id, balance, updated_at)
  values (v_job.user_id, 0, v_now)
  on conflict (user_id) do nothing;

  select *
    into v_balance
    from public.credit_balances
    where user_id = v_job.user_id
    for update;

  v_amount := abs(v_debit.amount);
  update public.credit_balances
    set balance = balance + v_amount,
        updated_at = v_now
    where user_id = v_job.user_id
    returning * into v_balance;

  insert into public.credit_transactions (
    id, user_id, type, amount, balance_after, reason,
    reference_type, reference_id, created_at
  )
  values (
    'credit_tx_' || gen_random_uuid()::text,
    v_job.user_id,
    'generate_refund',
    v_amount,
    v_balance.balance,
    'Refund generation job ' || v_job.mode || ': ' || coalesce(v_job.failure_reason, v_job.error_message, v_job.status),
    'generation_job',
    v_job.id,
    v_now
  );

  update public.generation_jobs
    set credit_refunded = true,
        updated_at = v_now
    where id = v_job.id;
  return true;
end;
$$;

revoke all on function public.claim_generation_job(text, integer, integer, text) from public;
revoke all on function public.renew_generation_job_lease(text, text, integer) from public;
revoke all on function public.refund_generation_job_once(text) from public;
grant execute on function public.claim_generation_job(text, integer, integer, text) to service_role;
grant execute on function public.renew_generation_job_lease(text, text, integer) to service_role;
grant execute on function public.refund_generation_job_once(text) to service_role;

select pg_notify('pgrst', 'reload schema');
