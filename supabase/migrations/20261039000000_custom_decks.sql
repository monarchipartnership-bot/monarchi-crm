-- Presentations can be made from a custom report (any dates): the deck is told apart by its end date too.
-- Apply together with the app version that saves decks with on_conflict (project_id, period_type, period_start, period_end, platform).
alter table project_decks drop constraint if exists project_decks_period_type_check;
alter table project_decks add constraint project_decks_period_type_check check (period_type in ('weekly', 'monthly', 'custom'));
alter table project_decks drop constraint if exists project_decks_project_id_period_type_period_start_platform_key;
alter table project_decks add constraint project_decks_scope_key unique (project_id, period_type, period_start, period_end, platform);
