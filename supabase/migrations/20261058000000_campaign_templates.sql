-- Templates of operations (spec 2026-11-02, §5): the settings of an operation saved once and started for any project in one click. Additive.
create table if not exists ag_campaign_templates (
  id bigserial primary key,
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  payload jsonb not null,           -- see src/lib/agents/campaignTemplates.js (snapshotOperation)
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table ag_campaign_templates enable row level security;
drop policy if exists ag_campaign_templates_all on ag_campaign_templates;
create policy ag_campaign_templates_all on ag_campaign_templates for all to authenticated using (true) with check (true);
