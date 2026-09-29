-- External-system id for deals imported from NetHunt (their CSV export's
-- <Record ID> column) — same pattern as clients.nethunt_id
-- (2026-09-20_client_nethunt_id.sql). Lets a re-import of the Leads/Deals
-- CSV skip rows already imported instead of creating duplicate deals.
-- Run this once in the Supabase SQL editor for this project.

alter table deals
  add column if not exists nethunt_id text;

create unique index if not exists deals_nethunt_id_idx on deals (nethunt_id) where nethunt_id is not null;
