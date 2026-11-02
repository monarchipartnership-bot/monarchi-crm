-- Settings of the notices of the AI Agents section (spec 2026-11-02, §7): where to tell about spending and about what needs attention.
-- One row. The bot is the same one that already works for the website leads; the topics are the ones the owner makes in the group.
-- Additive and safe to re-run. Signed-in team members only (like the other settings tables).
create table if not exists ai_agent_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  tg_chat_id text,                         -- the group (supergroup) where the notices go; null = Telegram is off, the CRM bell still works
  attention_thread_id bigint,              -- topic «AI Agents: потрібна увага» (null = the General topic)
  spend_thread_id bigint,                  -- topic «AI Agents: витрати»
  notify_emails text[] not null default '{}',   -- who gets the notices in the CRM bell
  digest_hour int not null default 9 check (digest_hour between 0 and 23),   -- the hour (Kyiv) of the daily total
  last_digest_date date,                   -- the day the last daily total was sent for (so it is sent once)
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into ai_agent_settings (id, notify_emails) values (1, array['oleksii.necheporenko@monarchi.agency']) on conflict (id) do nothing;

alter table ai_agent_settings enable row level security;
drop policy if exists ai_agent_settings_select on ai_agent_settings;
drop policy if exists ai_agent_settings_insert on ai_agent_settings;
drop policy if exists ai_agent_settings_update on ai_agent_settings;
drop policy if exists ai_agent_settings_delete on ai_agent_settings;
create policy ai_agent_settings_select on ai_agent_settings for select to authenticated using (true);
create policy ai_agent_settings_insert on ai_agent_settings for insert to authenticated with check (true);
create policy ai_agent_settings_update on ai_agent_settings for update to authenticated using (true) with check (true);
create policy ai_agent_settings_delete on ai_agent_settings for delete to authenticated using (true);

-- What each campaign has spent so far (Claude = the tasks of its agents, Higgsfield = the creatives), one row per campaign. The notices, the «Витрати» page and the cap read it.
create or replace view ag_campaign_spend with (security_invoker = true) as
select c.id as campaign_id,
       coalesce((select sum(t.cost_usd) from ag_tasks t where t.campaign_id = c.id), 0)::numeric as claude_usd,
       coalesce((select sum(s.usd) from ag_creative_spend s where s.campaign_id = c.id), 0)::numeric as higgsfield_usd
from ag_campaigns c;
grant select on ag_campaign_spend to authenticated;

-- The campaigns that exist already must not flood the bell on the first run: mark what they have spent as already told.
update ag_campaigns c
set notified_usd = floor((v.claude_usd + v.higgsfield_usd) / nullif(c.notify_step_usd, 0)) * c.notify_step_usd
from ag_campaign_spend v
where v.campaign_id = c.id and c.notify_step_usd > 0 and c.notified_usd = 0;
