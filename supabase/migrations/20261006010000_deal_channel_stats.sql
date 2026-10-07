-- Per-channel QL / Contract counts are derived from deals, so a deal has to
-- remember (a) through which Upwork channel it came (mb / inv / dm / con / pc /
-- gm — only meaningful when source = 'Upwork') and (b) when it became
-- qualified (MQL or SQL), because a week's or month's QL count needs a date.
-- Additive; the only data change is the qualified_at backfill below.

alter table deals
  add column if not exists upwork_channel text,
  add column if not exists qualified_at timestamptz;

-- Deals already qualified: the best available date is their last update.
update deals set qualified_at = updated_at
 where qualified_at is null and qualification in ('MQL', 'SQL');
