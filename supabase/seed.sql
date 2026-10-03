-- Seed rows for phase 2. Nothing creates a real analysis yet, so these exist
-- to prove the dashboard shows one organization's rows and not the other's.
-- No analysis was run for any of them; commit_sha stays null rather than
-- holding a made-up hash. Fixed ids make the file safe to re-run.
--
-- org_3K9SRs6pSduPW03BfAWx4QA3tvt  Abdullah's Organization
-- org_3KBLhxwRso6l6AxUEPvfPzkzNWx  Second Org

insert into public.organizations (id) values
  ('org_3K9SRs6pSduPW03BfAWx4QA3tvt'),
  ('org_3KBLhxwRso6l6AxUEPvfPzkzNWx')
on conflict (id) do nothing;

insert into public.projects (id, org_id, repo_url, owner, name) values
  ('00000000-0000-4000-8000-000000000101', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', 'https://github.com/vercel/swr',      'vercel',   'swr'),
  ('00000000-0000-4000-8000-000000000102', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', 'https://github.com/pmndrs/zustand',  'pmndrs',   'zustand'),
  ('00000000-0000-4000-8000-000000000201', 'org_3KBLhxwRso6l6AxUEPvfPzkzNWx', 'https://github.com/TanStack/query',  'TanStack', 'query')
on conflict (id) do nothing;

insert into public.analyses (id, org_id, project_id, status, error, created_at, finished_at) values
  ('00000000-0000-4000-8000-000000001101', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', '00000000-0000-4000-8000-000000000101', 'complete', null,
     now() - interval '2 days', now() - interval '2 days' + interval '41 seconds'),
  ('00000000-0000-4000-8000-000000001102', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', '00000000-0000-4000-8000-000000000102', 'failed', 'Seeded row: no analysis was run.',
     now() - interval '5 hours', now() - interval '5 hours' + interval '3 seconds'),
  ('00000000-0000-4000-8000-000000001103', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', '00000000-0000-4000-8000-000000000101', 'parsing', null,
     now() - interval '4 minutes', null),
  ('00000000-0000-4000-8000-000000001104', 'org_3K9SRs6pSduPW03BfAWx4QA3tvt', '00000000-0000-4000-8000-000000000102', 'queued', null,
     now() - interval '1 minute', null),
  ('00000000-0000-4000-8000-000000002101', 'org_3KBLhxwRso6l6AxUEPvfPzkzNWx', '00000000-0000-4000-8000-000000000201', 'complete', null,
     now() - interval '1 day', now() - interval '1 day' + interval '1 minute 12 seconds')
on conflict (id) do nothing;
