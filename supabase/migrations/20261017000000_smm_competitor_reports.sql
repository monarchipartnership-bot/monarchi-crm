-- Mon'Archi SMM: what the competitor agent learned from a competitor's public pages.
-- One row per analysis run (history is kept, the newest is the one in use). `pages` lists what was read
-- (address, title, whether it worked), `analysis` is the structured result (positioning, offers, content themes,
-- gaps, opportunities, post ideas, limits). Additive and safe to re-run. Signed-in team members only.

create table if not exists smm_competitor_reports (
  id bigint generated always as identity primary key,
  competitor_id bigint not null references smm_competitors(id) on delete cascade,
  pages jsonb not null default '[]'::jsonb,
  analysis jsonb,
  error text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists smm_competitor_reports_idx on smm_competitor_reports (competitor_id, created_at desc);

alter table smm_competitor_reports enable row level security;

do $$
declare t text := 'smm_competitor_reports';
begin
  execute format('drop policy if exists %I on %I', t || '_select', t);
  execute format('drop policy if exists %I on %I', t || '_insert', t);
  execute format('drop policy if exists %I on %I', t || '_delete', t);
  execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
  execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
  execute format('create policy %I on %I for delete to authenticated using (true)', t || '_delete', t);
end $$;
