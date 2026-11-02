-- «Стан системи»: the cron writes a heartbeat after every pass, so the page can say whether the agents are alive and what the last pass did. Additive, safe to re-run.
alter table ai_agent_settings add column if not exists last_tick_at timestamptz;
alter table ai_agent_settings add column if not exists last_tick_report jsonb not null default '{}'::jsonb;   -- { ms, processed, started, errors: [..] } of the last pass
