-- Prompt templates saved from successful generation results.
-- Safe to run repeatedly; does not require project_id because templates are global/shared.

create extension if not exists pgcrypto;

create table if not exists public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  generation_step text not null,
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
  created_from_generation_record_id text,
  created_from_job_id text,
  created_by uuid references public.profiles(id) on delete set null,
  input_previews jsonb not null default '[]'::jsonb,
  output_preview jsonb not null default '{}'::jsonb,
  parameter_summary jsonb not null default '{}'::jsonb,
  template_source text,
  cover_asset_id text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prompt_templates_generation_step
  on public.prompt_templates(generation_step);

create index if not exists idx_prompt_templates_created_at
  on public.prompt_templates(created_at desc);

create index if not exists idx_prompt_templates_is_public
  on public.prompt_templates(is_public);

create or replace function public.set_prompt_templates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_prompt_templates_updated_at on public.prompt_templates;
create trigger set_prompt_templates_updated_at
  before update on public.prompt_templates
  for each row
  execute function public.set_prompt_templates_updated_at();

alter table public.prompt_templates enable row level security;

drop policy if exists "Authenticated users can read public prompt templates" on public.prompt_templates;
create policy "Authenticated users can read public prompt templates"
  on public.prompt_templates for select
  to authenticated
  using (is_public = true);

drop policy if exists "Authenticated users can insert prompt templates" on public.prompt_templates;
create policy "Authenticated users can insert prompt templates"
  on public.prompt_templates for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users can update own prompt templates" on public.prompt_templates;
create policy "Users can update own prompt templates"
  on public.prompt_templates for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

drop policy if exists "Users can delete own prompt templates" on public.prompt_templates;
create policy "Users can delete own prompt templates"
  on public.prompt_templates for delete
  to authenticated
  using (auth.uid() = created_by);

select pg_notify('pgrst', 'reload schema');
