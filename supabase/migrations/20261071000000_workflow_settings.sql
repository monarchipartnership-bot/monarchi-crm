-- Settings of the whole agent system (step A11): the global emergency stop and the cost limits.
-- ONE row (id = 1). The stop switches every agent off at once: the orchestrator reads it first on every pass and does nothing while it is on.
-- Signed-in users can read and change it; nobody can add or delete rows, the anon role has no rights at all.

create table if not exists public.wf_settings (
  id smallint primary key default 1 check (id = 1),
  stopped boolean not null default false,
  stopped_reason text,
  stopped_by text,
  stopped_at timestamptz,
  monthly_cap_usd numeric(10,2) not null default 1000 check (monthly_cap_usd >= 0),
  project_cap_default_usd numeric(10,2) not null default 100 check (project_cap_default_usd >= 0),
  notify_telegram_chat text,
  updated_at timestamptz not null default now()
);
comment on table public.wf_settings is 'The global emergency stop and the default cost limits of the agent system (one row). A project may have its own limit in wf_project_state.cost_cap_usd.';

insert into public.wf_settings (id) values (1) on conflict (id) do nothing;

alter table public.wf_settings enable row level security;
revoke all on public.wf_settings from anon;
revoke all on public.wf_settings from public;
revoke all on public.wf_settings from authenticated;
grant select, update on public.wf_settings to authenticated;
drop policy if exists wf_settings_select on public.wf_settings;
create policy wf_settings_select on public.wf_settings for select to authenticated using (true);
drop policy if exists wf_settings_update on public.wf_settings;
create policy wf_settings_update on public.wf_settings for update to authenticated using (id = 1) with check (id = 1);
