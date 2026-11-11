-- The language of a client (owner, 2026-11-12): everything meant for the client (texts on the creatives, ad texts, captions, client reports) is written in it; what is meant
-- for the team is always Ukrainian. A language code of lib/agents/languages.js ('de', 'pl', ...); empty = not chosen yet (the creative and report teams do not launch without it).
alter table projects add column if not exists client_language text;
