-- The money of an operation: the tasks of the agents of the operation's own team (analytics, ads) have campaign_id empty and belong to the operation by the scope of the agent.
-- Before this the view counted only tasks with campaign_id, so the spend of such an operation was always 0 and its money cap never worked.
create or replace view ag_campaign_spend with (security_invoker = true) as
select c.id as campaign_id,
  coalesce((select sum(t.cost_usd) from ag_tasks t
            where t.campaign_id = c.id
               or (t.campaign_id is null and t.agent_id in (select a.id from ag_agents a where a.team = 'campaign' and a.scope_id = c.id::text))), 0::numeric) as claude_usd,
  coalesce((select sum(s.usd) from ag_creative_spend s where s.campaign_id = c.id), 0::numeric) as higgsfield_usd
from ag_campaigns c;
