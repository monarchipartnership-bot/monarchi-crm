-- Creative department, stage 4: the creative maker generates pictures in Higgsfield. Per creative we keep what it cost (USD, the Higgsfield REST API bills in
-- dollars: the estimate returned before the request), how many times it was generated, and the final picture with the text put over it (for the
-- languages where the system, not the image model, puts the words on the picture). The file itself lives in the bucket creative-assets.
-- Additive and safe to re-run.

alter table ag_creatives add column if not exists cost_usd numeric(10, 4) not null default 0;
alter table ag_creatives add column if not exists generations smallint not null default 0;
alter table ag_creatives add column if not exists final_url text;
alter table ag_creatives add column if not exists final_path text;
create index if not exists ag_creatives_created_idx on ag_creatives (created_at);

-- The ledger of what the pictures cost: a row per generation (+ the estimate Higgsfield returned) and a row (-) when the provider refuses a picture and
-- does not charge for it. The agent page sums it for 30 days and for all time, so the numbers survive a picture being made again or deleted.
create table if not exists ag_creative_spend (
  id bigint generated always as identity primary key,
  creative_id bigint,
  request_id bigint,
  campaign_id bigint,
  usd numeric(10, 4) not null,
  kind text not null default 'generation' check (kind in ('generation', 'refund')),
  model text,
  job_id text,
  created_at timestamptz not null default now()
);
create index if not exists ag_creative_spend_created_idx on ag_creative_spend (created_at);
create index if not exists ag_creative_spend_campaign_idx on ag_creative_spend (campaign_id, created_at);
alter table ag_creative_spend enable row level security;
drop policy if exists ag_creative_spend_all on ag_creative_spend;
create policy ag_creative_spend_all on ag_creative_spend for all to authenticated using (true) with check (true);
