-- Lets reportClientSync.js (Daily/Weekly report autosave) upsert one note
-- per deal per report day/week instead of inserting a fresh `deal_notes`
-- row on every debounced autosave tick while a manager is still typing —
-- see dealNotes.js's upsertDealNoteForDate.
-- Run this once in the Supabase SQL editor for this project.

alter table deal_notes
  add column if not exists report_date date;

create index if not exists deal_notes_deal_report_date_idx on deal_notes (deal_id, report_date);
