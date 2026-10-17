-- The moment an agent was last switched on: a scheduled run whose moment was BEFORE that is not made up for
-- (same rule as the project agents and the old SMM autopilot). Additive and safe to re-run.
alter table ag_agents add column if not exists enabled_since timestamptz;
