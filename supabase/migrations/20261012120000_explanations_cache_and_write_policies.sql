-- Phase 10: Explanations cache schema and write policies.

-- 1. Alter explanations table to allow folder explanations and cache metadata
alter table public.explanations
  alter column file_id drop not null;

alter table public.explanations
  add column if not exists target_type text not null default 'file' check (target_type in ('file', 'folder')),
  add column if not exists target_path text,
  add column if not exists content_hash text,
  add column if not exists model text,
  add column if not exists cache_key text;

-- Drop any non-unique index on (analysis_id, cache_key) if exists
drop index if exists public.explanations_analysis_cache_key_idx;

-- Unique index/constraint for upsert conflict target
create unique index if not exists explanations_analysis_cache_key_idx
  on public.explanations (analysis_id, cache_key);

alter table public.explanations
  drop constraint if exists explanations_analysis_cache_key_key;

alter table public.explanations
  add constraint explanations_analysis_cache_key_key
  unique using index explanations_analysis_cache_key_idx;

create index if not exists explanations_org_target_idx
  on public.explanations (org_id, target_path);

-- 2. Write policies for authenticated users matching their Clerk organization claim
drop policy if exists "members insert their organization's explanations" on public.explanations;
create policy "members insert their organization's explanations"
  on public.explanations for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

drop policy if exists "members update their organization's explanations" on public.explanations;
create policy "members update their organization's explanations"
  on public.explanations for update to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'))
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

drop policy if exists "members delete their organization's explanations" on public.explanations;
create policy "members delete their organization's explanations"
  on public.explanations for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

grant insert, update, delete on public.explanations to authenticated;

-- 3. Update policy for file_roles
drop policy if exists "members update their organization's file_roles" on public.file_roles;

create policy "members update their organization's file_roles"
  on public.file_roles for update to authenticated
  using (org_id = (((select auth.jwt()) -> 'o') ->> 'id'))
  with check (org_id = (((select auth.jwt()) -> 'o') ->> 'id'));

