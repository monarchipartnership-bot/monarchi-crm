-- The reports of the website analyst of the SMM team: figures from Google Analytics 4 and Search Console, the findings worked out in code,
-- the hand-off lines for the SEO agent and the strategist (all in `data`), and the short report the model phrased (`report`).
-- Additive and safe to re-run. Signed-in team members only.
create table if not exists smm_site_stats (
  id bigint generated always as identity primary key,
  period_start date,
  period_end date,
  data jsonb not null default '{}'::jsonb,
  report text not null default '',
  model_error text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists smm_site_stats_created_idx on smm_site_stats (created_at desc);

alter table smm_site_stats enable row level security;
drop policy if exists smm_site_stats_select on smm_site_stats;
drop policy if exists smm_site_stats_insert on smm_site_stats;
drop policy if exists smm_site_stats_update on smm_site_stats;
drop policy if exists smm_site_stats_delete on smm_site_stats;
create policy smm_site_stats_select on smm_site_stats for select to authenticated using (true);
create policy smm_site_stats_insert on smm_site_stats for insert to authenticated with check (true);
create policy smm_site_stats_update on smm_site_stats for update to authenticated using (true) with check (true);
create policy smm_site_stats_delete on smm_site_stats for delete to authenticated using (true);
