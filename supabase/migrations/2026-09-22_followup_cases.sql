-- Follow-up Generator's own case-study database, replacing the Google
-- Sheets + MCP-connector read (fetchProjectsFromSheet in followupApi.js —
-- an expensive, slow AI-mediated call just to re-read a spreadsheet).
-- Plain CRUD table instead, managed directly in the CRM's own UI.
-- Run this once in the Supabase SQL editor for this project.

create table if not exists followup_cases (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  position int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists followup_cases_position_idx on followup_cases(position);

-- Seed with the case studies that used to be hardcoded as DEFAULT_PROJECTS
-- in followupData.js — ported verbatim so nothing is lost.
insert into followup_cases (name, description, position) values
  ('Byme', 'Took over Google Ads and Meta Ads for byMe (fashion e-commerce) - revenue grew 48%, ROAS went from 6.6 to 9.3 on Google, and on Meta we cut ad spend by 22% while increasing ROAS by 50% (5.89 to 8.82).', 1),
  ('Oysters XO', 'Oysters XO (premium oyster catering, US market): built and scaled Google Ads in a highly competitive luxury niche - 113 monthly leads at $31-41 CPA, broke into Top-3 Search Impression Share, and maintained precision targeting for high-net-worth audiences through Search and Performance Max campaigns.', 2),
  ('HumanCentric', 'HumanCentric (US workspace accessories e-commerce): managed both Google Ads and Meta Ads - grew revenue by 42%, boosted ROAS by 85% (peak 4.2x), cut ad budget by 50% while maintaining order volume, and reduced CPA from $78 to $45 through cross-channel synergy and Performance Max optimization.', 3),
  ('MebModern', 'MebModern (furniture e-commerce): managed both Meta and Google Ads - boosted sales by 66%, scaled Google Ads budget by 70% while lifting ROAS from 4 to 14, doubled Meta ad spend while maintaining 4+ ROAS, and increased website conversion rate by 3.5x through funnel optimization and creative testing.', 4),
  ('Mola', 'Mola Brand (Ukrainian skincare & haircare e-commerce): managed Meta and Google Ads across two sub-brands, increased ROAS by 125% (peaking at 12.55), grew direct message conversions 3.5x, boosted sales volume by 70%, and reduced cost per conversion by 23% through creative testing, audience expansion, retargeting optimization, and value-based bidding.', 5),
  ('PNB', 'PNB (Ukrainian nail care e-commerce brand): managed Meta and Google Ads to expand beyond an existing customer base, increasing Meta ROAS from 1.5 to 4.08, achieving a record Google Ads ROAS of 7.0, and growing sales by 70% through creative production, audience segmentation, tracking fixes, and campaign restructuring.', 6),
  ('I Know The Pilot', '(Australian travel deals platform): built and scaled a Meta Ads lead generation funnel from scratch, reducing CPL by 54% ($2.4 to $1.1), increasing newsletter subscriptions by 60% (3,000 to 4,800 per month), and boosting CTR by 40% through funnel optimization, creative testing, and budget reallocation.', 7),
  ('NADZOR', 'Took over technical SEO for NADZOR (video surveillance & home security e-commerce, ~20,000 pages) - organic traffic grew from 2,700 to 18,000 visitors/month, rankings moved from position 25 to top-6 for core keywords, with clicks and impressions nearly tripling in under half a year.', 8),
  ('Lodka5', 'Took over technical SEO for Lodka5 (fishing, hunting & outdoor recreation e-commerce) - organic traffic grew from 0 to 40,000 visitors/month, reaching top-5 rankings for core keywords, with the site seeing more than 100% overall growth within a year.', 9),
  ('Boekhouders Totaal', 'Took over technical SEO for Boekhouders Totaal (Belgian accountant directory) - organic traffic grew from 3,000 to 20,000 visitors/month, reaching top-4 rankings, with the site eventually reaching 5x more traffic than before SEO work began.', 10);

-- RLS — same read-open/write-authenticated pattern as every other table.
alter table followup_cases enable row level security;

drop policy if exists followup_cases_select on followup_cases;
create policy followup_cases_select on followup_cases for select using (true);

drop policy if exists followup_cases_insert on followup_cases;
create policy followup_cases_insert on followup_cases for insert with check (auth.role() = 'authenticated');

drop policy if exists followup_cases_update on followup_cases;
create policy followup_cases_update on followup_cases for update using (auth.role() = 'authenticated');

drop policy if exists followup_cases_delete on followup_cases;
create policy followup_cases_delete on followup_cases for delete using (auth.role() = 'authenticated');
