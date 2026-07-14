create table if not exists public.edit_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text references public.projects(id) on delete set null,
  source_asset_id text not null references public.image_assets(id) on delete restrict,
  original_version_id text,
  current_version_id text,
  title text not null default '连续编辑',
  permanent_constraints jsonb not null default '{}'::jsonb,
  aspect_ratio text,
  status text not null default 'active' check (status in ('active','finalized','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_versions (
  id text primary key,
  asset_id text not null references public.image_assets(id) on delete restrict,
  session_id text not null references public.edit_sessions(id) on delete cascade,
  parent_version_id text references public.asset_versions(id) on delete restrict,
  version_number integer not null check (version_number >= 0),
  storage_path text not null,
  public_url text not null,
  user_instruction text not null default '',
  compiled_prompt text not null default '',
  provider text,
  model text,
  generation_job_id text references public.generation_jobs(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, version_number),
  unique (generation_job_id)
);

alter table public.edit_sessions
  add constraint edit_sessions_original_version_fk foreign key (original_version_id) references public.asset_versions(id) on delete restrict,
  add constraint edit_sessions_current_version_fk foreign key (current_version_id) references public.asset_versions(id) on delete restrict;

create table if not exists public.edit_messages (
  id text primary key,
  session_id text not null references public.edit_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  base_version_id text references public.asset_versions(id) on delete restrict,
  output_version_id text references public.asset_versions(id) on delete set null,
  generation_job_id text references public.generation_jobs(id) on delete set null,
  status text not null check (status in ('queued','running','succeeded','failed','cancelled','timeout')),
  created_at timestamptz not null default now()
);

create index if not exists edit_sessions_user_project_updated_idx on public.edit_sessions(user_id, project_id, updated_at desc);
create index if not exists asset_versions_session_created_idx on public.asset_versions(session_id, created_at asc);
create index if not exists asset_versions_parent_idx on public.asset_versions(parent_version_id);
create index if not exists edit_messages_session_created_idx on public.edit_messages(session_id, created_at asc);
create index if not exists edit_messages_job_idx on public.edit_messages(generation_job_id);

alter table public.edit_sessions enable row level security;
alter table public.asset_versions enable row level security;
alter table public.edit_messages enable row level security;

create policy "Users can read own edit sessions" on public.edit_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own edit sessions" on public.edit_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own edit sessions" on public.edit_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can read own asset versions" on public.asset_versions for select using (exists (select 1 from public.edit_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Users can insert own asset versions" on public.asset_versions for insert with check (created_by = auth.uid() and exists (select 1 from public.edit_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Users can read own edit messages" on public.edit_messages for select using (exists (select 1 from public.edit_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Users can insert own edit messages" on public.edit_messages for insert with check (exists (select 1 from public.edit_sessions s where s.id = session_id and s.user_id = auth.uid()));
create policy "Users can update own edit messages" on public.edit_messages for update using (exists (select 1 from public.edit_sessions s where s.id = session_id and s.user_id = auth.uid()));

select pg_notify('pgrst', 'reload schema');
