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

-- Index cache lookups by (analysis_id, cache_key)
create index if not exists explanations_analysis_cache_key_idx
  on public.explanations (analysis_id, cache_key);

create index if not exists explanations_org_target_idx
  on public.explanations (org_id, target_path);

-- 2. Write policies for authenticated users matching their Clerk organization claim
create policy "members insert their organization's explanations"
  on public.explanations for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members update their organization's explanations"
  on public.explanations for update to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'))
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members delete their organization's explanations"
  on public.explanations for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

grant insert, update, delete on public.explanations to authenticated;
