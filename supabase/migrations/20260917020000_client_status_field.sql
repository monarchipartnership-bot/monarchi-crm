-- New "Статус" pill next to the client's name on the profile page — a
-- lifecycle stage, separate from the existing "Тип контакту" field.
-- Run this once in the Supabase SQL editor for this project.

alter table clients
  add column if not exists status text;
