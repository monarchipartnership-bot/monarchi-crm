-- Full client profile redesign — "Основна інформація" split into three
-- blocks (Персональна інформація / Бізнес / Контактна інформація), each
-- with its own new fields. `country`/`phone` already existed on `clients`
-- (read via the deals→clients join elsewhere); everything else here is new.
-- Run this once in the Supabase SQL editor for this project.

alter table clients
  add column if not exists last_name text,
  add column if not exists contact_type text,
  add column if not exists source text,
  add column if not exists job_title text,
  add column if not exists niche text,
  add column if not exists websites text[] not null default '{}',
  add column if not exists socials text[] not null default '{}',
  add column if not exists goal_launch text,
  add column if not exists current_ad_channels text,
  add column if not exists service_interest text,
  add column if not exists brand_name_niche text,
  add column if not exists monthly_budget text,
  add column if not exists ad_campaign text,
  add column if not exists facebook_lead_id text,
  add column if not exists agency_experience text,
  add column if not exists start_timing text,
  add column if not exists email text,
  add column if not exists telegram text,
  add column if not exists whatsapp text,
  add column if not exists linkedin text,
  add column if not exists instagram text;
