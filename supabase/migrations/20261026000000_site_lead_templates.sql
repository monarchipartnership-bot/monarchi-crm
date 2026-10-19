-- A library of message templates for the Telegram message about a website lead: several saved forms, one of them active.
--   site_lead_templates          name + body (the template with {placeholders}); the standard form is built in and is not stored
--   site_lead_settings           + active_template_id (null = the standard form). `message_template` stays the BODY of the active one,
--                                so the server needs no join: choosing or editing the active template rewrites it.
-- An already saved custom message_template becomes the first template and stays active. Additive and safe to re-run.

create table if not exists site_lead_templates (
  id bigint generated always as identity primary key,
  name text not null,
  body text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table site_lead_settings add column if not exists active_template_id bigint references site_lead_templates(id) on delete set null;

do $$
declare tid bigint;
begin
  if exists (select 1 from site_lead_settings where id = 1 and message_template is not null and active_template_id is null)
     and not exists (select 1 from site_lead_templates) then
    insert into site_lead_templates (name, body, created_by)
      select 'Мій шаблон', message_template, 'migration' from site_lead_settings where id = 1 returning id into tid;
    update site_lead_settings set active_template_id = tid where id = 1;
  end if;
end $$;

alter table site_lead_templates enable row level security;
drop policy if exists site_lead_templates_select on site_lead_templates;
drop policy if exists site_lead_templates_insert on site_lead_templates;
drop policy if exists site_lead_templates_update on site_lead_templates;
drop policy if exists site_lead_templates_delete on site_lead_templates;
create policy site_lead_templates_select on site_lead_templates for select to authenticated using (true);
create policy site_lead_templates_insert on site_lead_templates for insert to authenticated with check (true);
create policy site_lead_templates_update on site_lead_templates for update to authenticated using (true) with check (true);
create policy site_lead_templates_delete on site_lead_templates for delete to authenticated using (true);
