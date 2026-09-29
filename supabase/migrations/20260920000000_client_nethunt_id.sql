-- External-system id for contacts imported from NetHunt (their CSV export's
-- <Record ID> column). Lets a re-import match the exact same row instead of
-- relying only on the normalized-name dedup (name_key) — and will double as
-- the join key when NetHunt's separate Deals export is imported next, since
-- name-only matching across two independently-exported files is fragile.
-- Run this once in the Supabase SQL editor for this project.

alter table clients
  add column if not exists nethunt_id text;

create unique index if not exists clients_nethunt_id_idx on clients (nethunt_id) where nethunt_id is not null;
