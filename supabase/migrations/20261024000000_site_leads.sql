-- Leads from the website forms (www.monarchi.agency): every submission is stored here, becomes a contact + a deal in the CRM
-- (pipeline «Website»), and is announced in Telegram chats and in the CRM bell.
--   site_lead_settings  ONE row (id = 1): on/off, the pipeline and the manager new deals go to, the Telegram chats, who is told in the CRM,
--                       the public site key the website snippet sends (it only keeps random noise out: the key is visible in the page),
--                       the sites that may send.
--   site_leads          the log: what came, what it became (client_id / deal_id), what happened to the Telegram message.
-- The bot token is NOT here: it is the TELEGRAM_BOT_TOKEN variable of the server.
-- Additive and safe to re-run. Signed-in team members only (the endpoint writes as the agent user).

create table if not exists site_lead_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default true,
  pipeline_id bigint references pipelines(id) on delete set null,
  manager text,
  telegram_chat_ids text[] not null default '{}',
  notify_emails text[] not null default '{}',
  site_key text not null default md5(random()::text || clock_timestamp()::text),
  allowed_origins text[] not null default array['https://www.monarchi.agency', 'https://monarchi.agency'],
  updated_by text,
  updated_at timestamptz not null default now()
);
insert into site_lead_settings (id, pipeline_id)
  select 1, (select id from pipelines where lower(name) = 'website' order by id limit 1)
  on conflict (id) do nothing;

create table if not exists site_leads (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  form text not null default 'contact',
  status text not null default 'new' check (status in ('new', 'duplicate', 'spam', 'error')),
  name text,
  email text,
  phone text,
  link text,
  services text[] not null default '{}',
  message text,
  page_url text,
  referrer text,
  utm jsonb,
  ip_hash text,
  client_id uuid references clients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  telegram_status text check (telegram_status in ('sent', 'failed', 'skipped')),
  telegram_error text,
  error text
);
create index if not exists site_leads_received_idx on site_leads (received_at desc);
create index if not exists site_leads_ip_idx on site_leads (ip_hash, received_at desc);

alter table site_lead_settings enable row level security;
alter table site_leads enable row level security;

do $$
declare t text;
begin
  foreach t in array array['site_lead_settings', 'site_leads'] loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (true)', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (true)', t || '_delete', t);
  end loop;
end $$;
