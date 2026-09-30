-- Run this once in the Supabase SQL editor for this project.
--
-- Two things, found and fixed together while scoping docs/ai-agents-
-- roadmap.md §4.7 (governance/permissions for the AI Agents section).
--
-- FINDING (CRITICAL, pre-existing, unrelated to AI agents): the
-- 2026-09-30 anon-blanket-policy audit (see
-- 20260930000000_drop_redundant_anon_all_policies.sql) covered 10 tables
-- but MISSED three more that used a different leftover-policy naming
-- style ("Allow all <table>" instead of "<table>_all_anon"/
-- "<table>_all_authenticated"): profiles, leave_requests, projects.
-- All three still had a `for all using (true) with check (true))` policy
-- open to role `public` (anon included) running alongside their own
-- correct per-action policies -- since RLS policies are OR'd, this fully
-- undid the "write requires authenticated" rule for all three tables.
-- Confirmed via a project-wide scan (pg_policy joined to pg_class,
-- filtered to polroles = '{-}' i.e. public, with an unconditional `true`
-- qual/check) that no other table has this leftover pattern -- these
-- three were the only ones still missed.
drop policy if exists "Allow all profiles" on profiles;
drop policy if exists "Allow all leave_requests" on leave_requests;
drop policy if exists "Allow all projects" on projects;

-- §4.7 groundwork: this CRM already has a lightweight role concept
-- (profiles.role, 'member' | 'ops_manager') but it was self-assignable
-- via a plain <select> on the user's own /account page (see
-- src/pages/Account/Account.jsx) and, since profiles_update only
-- required auth.role() = 'authenticated' with no ownership check, any
-- signed-in user could already edit ANY OTHER user's profile row too --
-- not just their own role. This helper + the two tightened policies
-- below are what turns `role` from a cosmetic UI toggle into something
-- that actually gates anything.
create or replace function public.is_ops_manager(user_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where email = user_email and role = 'ops_manager'
  );
$$;

-- profiles: a user can still update their OWN row's other fields (name,
-- photo, position, phone, etc. -- unchanged from today), and an
-- ops_manager can update ANY row (needed to promote/demote someone
-- else). But a non-manager can never change `role` -- not their own, not
-- anyone else's -- even via a hand-crafted request bypassing the UI. The
-- with-check subquery reads the pre-statement committed value of `role`
-- for that email (standard Postgres per-statement snapshot behavior), so
-- it correctly detects "is this update trying to change role" without
-- needing a trigger.
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles
  for update
  using (auth.email() = email or public.is_ops_manager(auth.email()))
  with check (
    public.is_ops_manager(auth.email())
    or role = (select p.role from profiles p where p.email = profiles.email)
  );

-- leave_requests: the only UPDATE this table ever receives is the
-- manager approve/reject action (reviewLeaveRequest in
-- src/lib/api/profile.js sets status + reviewed_by) -- a user's own
-- submit/cancel flow only ever INSERTs or DELETEs their own row, never
-- UPDATEs it (confirmed in src/components/Account/MyRequestsPanel.jsx).
-- So there is no legitimate self-update case to carve out here: only an
-- ops_manager may update any leave_requests row. Before this, any signed-
-- in user could approve/reject their OWN (or anyone else's) leave
-- request directly, defeating the point of approval.
drop policy if exists "leave_requests_update" on leave_requests;
create policy "leave_requests_update" on leave_requests
  for update
  using (public.is_ops_manager(auth.email()))
  with check (public.is_ops_manager(auth.email()));

-- Initial ops_managers, per explicit user decision (2026-09-30) -- every
-- profile currently has role = 'member', so without this no one could
-- ever have promoted anyone once self-assignment above was closed off.
update profiles set role = 'ops_manager'
  where email in ('oleksii.necheporenko@monarchi.agency', 'monarchi.partnership@gmail.com');
