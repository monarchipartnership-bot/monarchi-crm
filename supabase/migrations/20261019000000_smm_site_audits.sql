-- Mon'Archi SMM: the SEO agent. smm_settings.site_url is the address of Monarchi's own public site; every audit run is kept
-- in smm_site_audits (what was read, the issues found by code, the model's priority plan with proposed titles/descriptions).
-- The agent only READS public pages; it never edits the site. Additive and safe to re-run. Signed-in team members only.

alter table smm_settings add column if not exists site_url text not null default 'https://www.monarchi.agency';

create table if not exists smm_site_audits (
  id bigint generated always as identity primary key,
  site_url text not null,
  summary jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  pages jsonb not null default '[]'::jsonb,
  plan jsonb,
  error text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists smm_site_audits_idx on smm_site_audits (created_at desc);

alter table smm_site_audits enable row level security;

do $$
declare t text := 'smm_site_audits';
begin
  execute format('drop policy if exists %I on %I', t || '_select', t);
  execute format('drop policy if exists %I on %I', t || '_insert', t);
  execute format('drop policy if exists %I on %I', t || '_delete', t);
  execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
  execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
  execute format('create policy %I on %I for delete to authenticated using (true)', t || '_delete', t);
end $$;
