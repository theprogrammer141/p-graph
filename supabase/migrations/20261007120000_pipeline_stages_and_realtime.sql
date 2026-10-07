-- Phase 7: Pipeline stages, coverage, realtime broadcast, and write policies.

-- 1. Alter analyses table
alter table public.analyses
  add column if not exists stage text check (stage in ('fetch', 'select', 'parse', 'store', 'complete', 'failed')),
  add column if not exists stage_message text,
  add column if not exists failed_stage text,
  add column if not exists coverage jsonb,
  add column if not exists adapter text;

-- 2. Alter files table for graph node metadata
alter table public.files
  add column if not exists lines integer not null default 0,
  add column if not exists sha256 text;

-- 3. Alter edges table to support 'dynamic' and type_only flag
alter table public.edges
  add column if not exists type_only boolean not null default false;

alter table public.edges
  drop constraint if exists edges_kind_check;

alter table public.edges
  add constraint edges_kind_check
  check (kind in ('import', 're-export', 'dynamic', 'dynamic-import', 'require'));

-- 4. Write policies for authenticated users matching their Clerk organization claim
create policy "members insert their organization's projects"
  on public.projects for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members update their organization's projects"
  on public.projects for update to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'))
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members insert their organization's analyses"
  on public.analyses for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members update their organization's analyses"
  on public.analyses for update to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'))
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members insert their organization's files"
  on public.files for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members delete their organization's files"
  on public.files for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members insert their organization's edges"
  on public.edges for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members delete their organization's edges"
  on public.edges for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

-- 5. Data API grants for writing
grant insert, update, delete on
  public.projects, public.analyses, public.files, public.edges
to authenticated;

-- 6. Realtime broadcast trigger on public.analyses
create or replace function public.broadcast_analysis_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (TG_OP = 'INSERT') or
     (NEW.stage is distinct from OLD.stage) or
     (NEW.stage_message is distinct from OLD.stage_message) or
     (NEW.status is distinct from OLD.status) or
     (NEW.error is distinct from OLD.error) then
    perform realtime.send(
      jsonb_build_object(
        'analysis_id', NEW.id,
        'stage', NEW.stage,
        'message', coalesce(NEW.stage_message, ''),
        'status', NEW.status,
        'error', NEW.error,
        'failed_stage', NEW.failed_stage
      ),
      'stage_change',
      'analysis:' || NEW.id::text,
      true
    );
  end if;
  return NEW;
end;
$$;

revoke execute on function public.broadcast_analysis_stage() from public, anon, authenticated;

drop trigger if exists trigger_broadcast_analysis_stage on public.analyses;

create trigger trigger_broadcast_analysis_stage
after insert or update on public.analyses
for each row
execute procedure public.broadcast_analysis_stage();

-- 7. Realtime channel subscription authorization policy on realtime.messages
create policy "members receive broadcast for their analysis"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.analyses a
      where ('analysis:' || a.id::text) = (select realtime.topic())
        and a.org_id = ((select auth.jwt()) -> 'o' ->> 'id')
    )
  );
