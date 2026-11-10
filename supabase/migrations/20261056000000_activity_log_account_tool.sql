-- «Останні дії» of the account page: the login, profile, password and leave-request events are logged with tool = 'account', but the check constraint only knew
-- 'followup' and 'image_studio', so every such insert was refused (HTTP 400 in the browser console on every sign-in). The constraint now also allows 'account'.
-- Additive and safe to re-run.
alter table activity_log drop constraint if exists activity_log_tool_check;
alter table activity_log add constraint activity_log_tool_check check (tool = any (array['followup', 'image_studio', 'account']));
