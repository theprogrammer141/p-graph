-- Allow authenticated users to insert their active Clerk organization row
create policy "members insert their organization"
  on public.organizations for insert to authenticated
  with check (id = (((select auth.jwt()) -> 'o') ->> 'id'));

grant insert on public.organizations to authenticated;
