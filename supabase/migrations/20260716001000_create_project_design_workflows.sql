create table if not exists public.project_design_workflows (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null default '设计表达流程',
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  current_node_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_design_workflow_nodes (
  id text primary key,
  workflow_id text not null references public.project_design_workflows(id) on delete cascade,
  parent_node_id text references public.project_design_workflow_nodes(id) on delete set null,
  stage_key text not null check (stage_key in (
    'input',
    'base-render',
    'design-variants',
    'material-replace',
    'object-insert',
    'continuous-edit',
    'image-polish',
    'delivery'
  )),
  status text not null default 'active' check (status in ('active', 'completed', 'skipped')),
  source_feature text,
  input_asset_id text references public.image_assets(id) on delete restrict,
  parent_job_id text references public.generation_jobs(id) on delete set null,
  parent_result_id text references public.generation_results(id) on delete set null,
  output_job_id text references public.generation_jobs(id) on delete set null,
  output_result_id text references public.generation_results(id) on delete set null,
  output_asset_id text references public.image_assets(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_design_workflows_current_node_fk'
      and conrelid = 'public.project_design_workflows'::regclass
  ) then
    alter table public.project_design_workflows
      add constraint project_design_workflows_current_node_fk
      foreign key (current_node_id)
      references public.project_design_workflow_nodes(id)
      on delete set null;
  end if;
end
$$;

create index if not exists project_design_workflows_project_updated_idx
  on public.project_design_workflows(user_id, project_id, updated_at desc);

create index if not exists project_design_workflow_nodes_workflow_created_idx
  on public.project_design_workflow_nodes(workflow_id, created_at asc);

create index if not exists project_design_workflow_nodes_parent_idx
  on public.project_design_workflow_nodes(parent_node_id);

alter table public.project_design_workflows enable row level security;
alter table public.project_design_workflow_nodes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_design_workflows'
      and policyname = 'Users manage own project design workflows'
  ) then
    create policy "Users manage own project design workflows"
      on public.project_design_workflows
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'project_design_workflow_nodes'
      and policyname = 'Users manage own project design workflow nodes'
  ) then
    create policy "Users manage own project design workflow nodes"
      on public.project_design_workflow_nodes
      for all
      using (
        exists (
          select 1
          from public.project_design_workflows workflow
          where workflow.id = workflow_id
            and workflow.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from public.project_design_workflows workflow
          where workflow.id = workflow_id
            and workflow.user_id = auth.uid()
        )
      );
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
