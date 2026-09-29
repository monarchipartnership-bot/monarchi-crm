-- Run this once in the Supabase SQL editor for this project.
--
-- Three security findings from a full Supabase audit (2026-09-30),
-- fixed together in one migration. The first is CRITICAL.
--
-- FINDING 1 (CRITICAL): 10 tables (client_changes, client_files, clients, deal_activity,
-- deal_notes, deal_participants, deal_stages, deals, notifications,
-- pipelines) carried leftover "blanket" RLS policies from
-- 2026-09-19_enable_rls_everywhere.sql (`<table>_all_anon` / `<table>
-- _all_authenticated`, `for all using (true) with check (true)`),
-- predating this project's later per-action policy convention
-- (`<table>_select` / `_insert` / `_update` / `_delete`, select open,
-- write requires auth.role() = 'authenticated').
--
-- Because RLS policies are OR'd together, the leftover blanket policies
-- were NOT superseded by the newer, correct per-action ones — they ran
-- alongside them. Net effect: an anonymous request using only the public
-- anon key (embedded in the deployed frontend bundle, visible to anyone)
-- could INSERT/UPDATE/DELETE any row in all 10 tables, completely
-- bypassing the "write requires authenticated" rule every migration
-- since has assumed was in force. Confirmed before dropping anything:
-- every one of these 10 tables already has its own working select/
-- insert/update/delete policies for role `public` (which already covers
-- both anon and authenticated correctly) — so this is a pure removal of
-- dead, over-permissive duplicates, not a change to the intended access
-- model.

drop policy if exists client_changes_all_anon on client_changes;
drop policy if exists client_changes_all_authenticated on client_changes;

drop policy if exists client_files_meta_all_anon on client_files;
drop policy if exists client_files_meta_all_authenticated on client_files;

drop policy if exists clients_all_anon on clients;
drop policy if exists clients_all_authenticated on clients;

drop policy if exists deal_activity_all_anon on deal_activity;
drop policy if exists deal_activity_all_authenticated on deal_activity;

drop policy if exists deal_notes_all_anon on deal_notes;
drop policy if exists deal_notes_all_authenticated on deal_notes;

drop policy if exists deal_participants_all_anon on deal_participants;
drop policy if exists deal_participants_all_authenticated on deal_participants;

drop policy if exists deal_stages_all_anon on deal_stages;
drop policy if exists deal_stages_all_authenticated on deal_stages;

drop policy if exists deals_all_anon on deals;
drop policy if exists deals_all_authenticated on deals;

drop policy if exists notifications_all_anon on notifications;
drop policy if exists notifications_all_authenticated on notifications;

drop policy if exists pipelines_all_anon on pipelines;
drop policy if exists pipelines_all_authenticated on pipelines;

-- FINDING 2: 4 SECURITY DEFINER functions meant
-- only for pg_cron (cleanup_old_notifications, send_task_reminders,
-- run_deal_health_check) or as a BEFORE INSERT/UPDATE trigger
-- (enforce_corporate_email) were, by Postgres/PostgREST's default grants,
-- also directly callable by anyone via `/rest/v1/rpc/<name>` using only
-- the public anon key — e.g. anon could call cleanup_old_notifications()
-- on demand and wipe the whole notifications table, or spam
-- run_deal_health_check() to flood the agent review queue. None of the 4
-- are meant to be called that way: pg_cron invokes them directly against
-- Postgres (not through PostgREST), so revoking anon/authenticated
-- EXECUTE here does not affect the scheduled jobs at all.
revoke execute on function public.cleanup_old_notifications() from anon, authenticated;
revoke execute on function public.send_task_reminders() from anon, authenticated;
revoke execute on function public.run_deal_health_check(integer) from anon, authenticated;
revoke execute on function public.enforce_corporate_email() from anon, authenticated;

-- FINDING 3: enforce_corporate_email had a mutable search_path (not
-- pinned), a minor hardening gap for a SECURITY DEFINER function — pin it
-- the same way every other SECURITY DEFINER function in this project
-- already does.
alter function public.enforce_corporate_email() set search_path = public;
