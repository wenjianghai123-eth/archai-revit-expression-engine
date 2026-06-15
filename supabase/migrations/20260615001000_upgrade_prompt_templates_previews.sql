-- Add prompt template preview/summary fields used by the current backend.
-- Safe to run repeatedly on existing Supabase projects.

alter table public.prompt_templates
  add column if not exists input_previews jsonb not null default '[]'::jsonb,
  add column if not exists output_preview jsonb not null default '{}'::jsonb,
  add column if not exists parameter_summary jsonb not null default '{}'::jsonb,
  add column if not exists template_source text,
  add column if not exists cover_asset_id text,
  add column if not exists cover_url text;

update public.prompt_templates
set
  template_source = coalesce(template_source, 'generation_result'),
  cover_asset_id = coalesce(cover_asset_id, output_asset_id, preview_asset_id),
  cover_url = coalesce(cover_url, output_url)
where template_source is null
  or cover_asset_id is null
  or cover_url is null;

select pg_notify('pgrst', 'reload schema');
