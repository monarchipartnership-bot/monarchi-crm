-- Security Advisor flagged every one of these tables as "RLS Disabled in
-- Public" — they're reachable through the public REST API (PostgREST) with
-- no row-level security at all, meaning anyone holding the project's anon
-- key could read or write them directly, bypassing the app entirely.
-- `client_notes`/`deal_service_tags` already got RLS when they were created
-- (see 2026-09-17_client_photo_and_notes.sql / _deal_extra_fields.sql) —
-- this applies the exact same two-rule pattern to every other table the app
-- uses: anyone can read (matches how the app already behaves — there's no
-- per-row ownership model anywhere), only an authenticated session can
-- write. No app behavior changes; this only blocks the same actions when
-- attempted outside the app.
-- Run this once in the Supabase SQL editor for this project.

do $$
declare
  t text;
  tables text[] := array[
    'activity_log', 'annual_reports', 'client_changes', 'client_files', 'clients',
    'custom_tags', 'daily_reports', 'deal_activity', 'deal_notes', 'deal_participants',
    'deal_stages', 'deals', 'leave_requests', 'monthly_reports', 'notifications',
    'pipelines', 'profiles', 'project_daily_reports', 'project_monthly_reports',
    'project_weekly_reports', 'projects', 'tasks', 'weekly_reports'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select using (true)', t || '_select', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (auth.role() = ''authenticated'')', t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update using (auth.role() = ''authenticated'')', t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (auth.role() = ''authenticated'')', t || '_delete', t);
  end loop;
end $$;
