alter table public.edit_sessions
  add column if not exists primary_version_id text,
  add column if not exists final_version_id text;

alter table public.asset_versions
  add column if not exists display_name text,
  add column if not exists note text not null default '',
  add column if not exists restored_from_version_id text,
  add column if not exists exported_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'edit_sessions_primary_version_fk'
      and conrelid = 'public.edit_sessions'::regclass
  ) then
    alter table public.edit_sessions
      add constraint edit_sessions_primary_version_fk
      foreign key (primary_version_id)
      references public.asset_versions(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'edit_sessions_final_version_fk'
      and conrelid = 'public.edit_sessions'::regclass
  ) then
    alter table public.edit_sessions
      add constraint edit_sessions_final_version_fk
      foreign key (final_version_id)
      references public.asset_versions(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'asset_versions_restored_from_version_fk'
      and conrelid = 'public.asset_versions'::regclass
  ) then
    alter table public.asset_versions
      add constraint asset_versions_restored_from_version_fk
      foreign key (restored_from_version_id)
      references public.asset_versions(id)
      on delete set null;
  end if;
end
$$;

create index if not exists edit_sessions_project_updated_idx
  on public.edit_sessions(user_id, project_id, updated_at desc);

create index if not exists asset_versions_restored_from_idx
  on public.asset_versions(restored_from_version_id);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_versions'
      and policyname = 'Users can update own asset versions'
  ) then
    create policy "Users can update own asset versions"
      on public.asset_versions
      for update
      using (
        exists (
          select 1
          from public.edit_sessions s
          where s.id = session_id
            and s.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.edit_sessions s
          where s.id = session_id
            and s.user_id = auth.uid()
        )
      );
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
