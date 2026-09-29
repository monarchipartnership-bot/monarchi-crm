-- Run this once in the Supabase SQL editor for this project.
--
-- Links a CRM client to their Google Ads account, so the Ads Insights
-- Analyst agent (see ConstellationTest.jsx's ads-insights-analyst node)
-- knows which customer_id to query on their behalf.
alter table clients add column if not exists google_ads_customer_id text;
