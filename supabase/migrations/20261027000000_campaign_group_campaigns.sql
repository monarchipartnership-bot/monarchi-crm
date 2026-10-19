-- Campaign groups of a project are now sets of CHOSEN campaigns (any number, from any linked account), not keyword rules.
--   project_campaign_groups.campaigns  the chosen campaigns as 'platform|campaign name' keys (e.g. 'meta|TOF | CBO | US')
-- Groups made earlier by keywords keep working: a campaign belongs to a group when it is in `campaigns` OR matches one of the old
-- `keywords`; saving such a group in the new form turns what it matches today into an explicit list. Additive and safe to re-run.
alter table project_campaign_groups add column if not exists campaigns text[] not null default '{}';
