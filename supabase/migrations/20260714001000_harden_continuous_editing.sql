alter table public.edit_messages
  add column if not exists client_request_id text,
  add column if not exists error_code text,
  add column if not exists error_message text;

create unique index if not exists edit_messages_session_client_request_unique_idx
  on public.edit_messages(session_id, client_request_id)
  where client_request_id is not null;

create index if not exists asset_versions_generation_job_idx
  on public.asset_versions(generation_job_id);

select pg_notify('pgrst', 'reload schema');
