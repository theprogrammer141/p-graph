-- Phase 2: the workspace schema.
--
-- Authorization model: every row carries org_id, and the only thing deciding
-- who may read it is a policy comparing org_id to the organization claim on
-- the Clerk session token (v2 token: auth.jwt() -> 'o' ->> 'id'). Application
-- code never filters by organization.

-- ---------------------------------------------------------------------------
-- RLS on by default.
--
-- A table where someone forgot to enable RLS returns everything, silently. A
-- table with RLS and no policy returns nothing, which is visible. So rather
-- than relying on every future migration remembering `enable row level
-- security`, an event trigger enables it on every table created in public.
-- Created first so it covers the tables below too.
-- ---------------------------------------------------------------------------

create schema if not exists private;

create or replace function private.enable_rls_on_new_tables()
returns event_trigger
language plpgsql
as $$
declare
  cmd record;
begin
  for cmd in
    select object_identity
    from pg_event_trigger_ddl_commands()
    where object_type = 'table'
      and schema_name = 'public'
      and command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

create event trigger enable_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function private.enable_rls_on_new_tables();

-- ---------------------------------------------------------------------------
-- Organizations.
--
-- Organizations live in Clerk; this table exists so the eight tables below
-- have something to hold a foreign key to, and so deleting an organization
-- removes everything it owns by cascade. id is the Clerk org id.
-- ---------------------------------------------------------------------------

create table public.organizations (
  id         text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The eight tables.
--
-- Every table has org_id -> organizations on delete cascade. Child tables
-- reference their parent by (id, org_id) rather than id alone, so a row can
-- never claim a different organization than the analysis it belongs to.
-- ---------------------------------------------------------------------------

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references public.organizations (id) on delete cascade,
  repo_url   text not null,
  owner      text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (org_id, repo_url),
  unique (id, org_id)
);

create table public.analyses (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  project_id  uuid not null,
  status      text not null default 'queued'
              check (status in ('queued', 'parsing', 'complete', 'failed')),
  commit_sha  text,
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, org_id),
  foreign key (project_id, org_id) references public.projects (id, org_id) on delete cascade
);

create table public.files (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path        text not null,
  unique (analysis_id, path),
  unique (id, org_id),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade
);

create table public.edges (
  id             uuid primary key default gen_random_uuid(),
  org_id         text not null references public.organizations (id) on delete cascade,
  analysis_id    uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  kind           text not null
                 check (kind in ('import', 're-export', 'dynamic-import', 'require')),
  foreign key (analysis_id, org_id)    references public.analyses (id, org_id) on delete cascade,
  foreign key (source_file_id, org_id) references public.files (id, org_id) on delete cascade,
  foreign key (target_file_id, org_id) references public.files (id, org_id) on delete cascade
);

create table public.routes (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id     uuid not null,
  method      text not null,
  path        text not null,
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, org_id)     references public.files (id, org_id) on delete cascade
);

create table public.explanations (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id     uuid not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, org_id)     references public.files (id, org_id) on delete cascade
);

create table public.file_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id     uuid not null,
  role        text not null,
  -- Whether the role came from a convention adapter or an AI label.
  source      text not null check (source in ('convention', 'ai')),
  unique (file_id),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade,
  foreign key (file_id, org_id)     references public.files (id, org_id) on delete cascade
);

create table public.insights (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  foreign key (analysis_id, org_id) references public.analyses (id, org_id) on delete cascade
);

-- Indexes on the columns policies and joins hit. Postgres does not index
-- foreign key columns on its own.
create index on public.projects (org_id);
create index on public.analyses (org_id, created_at desc);
create index on public.analyses (project_id);
create index on public.files (org_id);
create index on public.edges (org_id);
create index on public.edges (analysis_id);
create index on public.edges (source_file_id);
create index on public.edges (target_file_id);
create index on public.routes (org_id);
create index on public.routes (analysis_id);
create index on public.routes (file_id);
create index on public.explanations (org_id);
create index on public.explanations (analysis_id);
create index on public.explanations (file_id);
create index on public.file_roles (org_id);
create index on public.file_roles (analysis_id);
create index on public.insights (org_id);
create index on public.insights (analysis_id);

-- ---------------------------------------------------------------------------
-- Policies.
--
-- Read only for now: nothing in the app writes yet, and a write policy nobody
-- exercises is a guess. Each is the same predicate, the org claim off the
-- token. `(select ...)` makes Postgres evaluate it once per query rather than
-- once per row. A token with no org claim (a personal account) matches nothing.
-- ---------------------------------------------------------------------------

create policy "members read their organization"
  on public.organizations for select to authenticated
  using (id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.projects for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.analyses for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.files for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.edges for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.routes for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.explanations for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.file_roles for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

create policy "members read their organization's rows"
  on public.insights for select to authenticated
  using (org_id = (select auth.jwt() -> 'o' ->> 'id'));

-- Table access for the Data API. Newer projects don't grant this
-- automatically; RLS above still decides which rows come back.
grant select on
  public.organizations, public.projects, public.analyses, public.files,
  public.edges, public.routes, public.explanations, public.file_roles,
  public.insights
to authenticated;

-- ---------------------------------------------------------------------------
-- Fail the migration if any table in public lacks RLS, rather than trusting
-- the event trigger worked.
-- ---------------------------------------------------------------------------

do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'tables in public without row level security: %', missing;
  end if;
end;
$$;
