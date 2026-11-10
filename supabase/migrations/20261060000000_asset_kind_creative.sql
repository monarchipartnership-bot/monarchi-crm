-- «Готові креативи» become a kind of the client's files (owner, 2026-11-11): the examples of ready creatives are uploaded like the logo and the product photos.
-- Additive: the check of the kind is widened, nothing else changes.
alter table project_creative_assets drop constraint if exists project_creative_assets_kind_check;
alter table project_creative_assets add constraint project_creative_assets_kind_check check (kind in ('logo', 'product', 'style', 'creative', 'other'));
