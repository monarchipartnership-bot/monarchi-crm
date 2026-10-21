-- Which campaigns a report shows: the layout of a platform keeps a SELECTION { groups: [group ids], campaigns: ['platform|campaign name', ...] }.
-- A selected group adds one highlighted column (the sum of the whole group) and then its campaigns, each in its own column; selected campaigns
-- follow. A campaign that is not selected (directly or through a group) is not in the report. The totals are always those of the whole account.
-- Layouts saved before this column existed keep what they showed so far: every group of their platform is selected (run once).
alter table project_report_layouts add column if not exists campaign_selection jsonb not null default '{"groups":[],"campaigns":[]}'::jsonb;

update project_report_layouts l
set campaign_selection = jsonb_build_object(
  'groups', coalesce((select jsonb_agg(g.id order by g.sort, g.id) from project_campaign_groups g where g.project_id = l.project_id and (g.platform is null or g.platform = l.platform)), '[]'::jsonb),
  'campaigns', '[]'::jsonb)
where l.campaign_selection = '{"groups":[],"campaigns":[]}'::jsonb;
