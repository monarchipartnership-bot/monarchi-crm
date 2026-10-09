-- When the project AI agent was last switched on. The scheduler only starts a report whose scheduled
-- moment came AFTER this, so switching an agent on on a Wednesday does not at once produce Monday's report.
alter table project_agents add column if not exists enabled_since timestamptz;
update project_agents set enabled_since = coalesce(enabled_since, updated_at) where enabled and enabled_since is null;
