-- New clients should land as 'Новий' automatically (per the confirmed
-- status list in src/lib/clientStatus.js) without the app code having to
-- set it explicitly on every insert. A column DEFAULT only fires on INSERT
-- (never touches an existing row's status on UPDATE/upsert), so this is
-- safe to run even with clients already in the table.
-- Run this once in the Supabase SQL editor for this project.

alter table clients
  alter column status set default 'Новий';
