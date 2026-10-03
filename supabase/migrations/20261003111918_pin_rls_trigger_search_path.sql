-- Advisor 0011: pin search_path on the RLS event trigger function. It only
-- uses schema-qualified identities from pg_event_trigger_ddl_commands(), so an
-- empty search_path costs nothing.
alter function private.enable_rls_on_new_tables() set search_path = '';
