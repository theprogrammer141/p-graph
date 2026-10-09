-- Phase 8: Write policies and grants for routes and file_roles.

create policy "members insert their organization's routes"
  on public.routes for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members delete their organization's routes"
  on public.routes for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members insert their organization's file_roles"
  on public.file_roles for insert to authenticated
  with check (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

create policy "members delete their organization's file_roles"
  on public.file_roles for delete to authenticated
  using (org_id = ((select auth.jwt()) -> 'o' ->> 'id'));

grant insert, update, delete on
  public.routes, public.file_roles
to authenticated;
