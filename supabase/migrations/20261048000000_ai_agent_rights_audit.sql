-- Rights and the journal of the AI Agents section (spec 2026-11-02, §9): who starts paid work, confirms results and changes the money limits, and a journal of what people did.
--   ai_agent_settings.approvers   the people (emails) who may start paid work, confirm results and change a campaign's money limits; EMPTY = anyone with access (as the
--                                 approvers of project reports). Operations managers (profiles.role = 'ops_manager') may always, and only they change this list.
--   ag_audit_log                  an append-only journal (nobody can edit or delete a row through the API)
-- The server (api/agent-queue.js) checks the same rules before an action and writes the journal; the triggers below hold the rules for what the browser writes directly.
-- Additive and safe to re-run.

alter table ai_agent_settings add column if not exists approvers text[] not null default '{}';

create table if not exists ag_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,              -- 'launch_campaign', 'generate_creatives', 'creative_approved', 'cap_changed', 'denied' ...
  campaign_id bigint,                -- no foreign keys: the journal outlives what it talks about
  project_id bigint,
  subject text not null default '',
  summary text not null default '',
  meta jsonb not null default '{}'::jsonb
);
create index if not exists ag_audit_log_at_idx on ag_audit_log (at desc);
create index if not exists ag_audit_log_campaign_idx on ag_audit_log (campaign_id, at desc);
create index if not exists ag_audit_log_project_idx on ag_audit_log (project_id, at desc);

alter table ag_audit_log enable row level security;
drop policy if exists ag_audit_log_select on ag_audit_log;
drop policy if exists ag_audit_log_insert on ag_audit_log;
create policy ag_audit_log_select on ag_audit_log for select to authenticated using (true);
create policy ag_audit_log_insert on ag_audit_log for insert to authenticated with check (true);
-- no update and no delete policy: the journal is append-only

-- who is acting (the email of the session; null for the service role or a plain SQL session)
create or replace function ag_actor() returns text language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', '')
$$;

-- may this person start paid work / confirm results / change money limits? Nobody chosen = anyone; ops managers always; no email (system) always.
create or replace function ag_can_approve(who text) returns boolean language sql stable security definer set search_path = public as $$
  select who is null
    or coalesce((select cardinality(s.approvers) = 0 from ai_agent_settings s where s.id = 1), true)
    or exists (select 1 from ai_agent_settings s where s.id = 1 and lower(who) = any (select lower(x) from unnest(s.approvers) x))
    or is_ops_manager(who)
$$;

-- ---- a decision on a creative: only approvers; the decision goes to the journal
create or replace function ag_creative_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := ag_actor();
  camp bigint;
  proj bigint;
begin
  if new.status is not distinct from old.status or new.status not in ('approved', 'rejected') then return new; end if;
  if not ag_can_approve(who) then
    raise exception 'Підтверджувати й відхиляти матеріали можуть лише призначені утверджувачі.' using errcode = '42501';
  end if;
  select r.campaign_id into camp from ag_creative_requests r where r.id = new.request_id;
  select c.project_id into proj from ag_campaigns c where c.id = camp;
  insert into ag_audit_log (actor, action, campaign_id, project_id, subject, summary, meta)
  values (who, case when new.status = 'approved' then 'creative_approved' else 'creative_rejected' end, camp, proj,
          coalesce(nullif(new.concept_name, ''), new.concept_key, '') || ' · ' || coalesce(new.ratio, ''),
          case when new.status = 'approved' then 'Затвердив креатив' else 'Відхилив креатив' end || coalesce(': ' || nullif(new.note, ''), ''),
          jsonb_build_object('creative_id', new.id, 'request_id', new.request_id));
  return new;
end $$;
drop trigger if exists ag_creatives_rights on ag_creatives;
create trigger ag_creatives_rights before update of status on ag_creatives for each row execute function ag_creative_rights();

-- ---- a campaign: its money limits only by approvers; the limits and the status go to the journal
create or replace function ag_campaign_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := ag_actor();
begin
  if new.spend_cap_usd is distinct from old.spend_cap_usd or new.notify_step_usd is distinct from old.notify_step_usd then
    if not ag_can_approve(who) then
      raise exception 'Змінювати ліміти витрат кампанії можуть лише призначені утверджувачі.' using errcode = '42501';
    end if;
    insert into ag_audit_log (actor, action, campaign_id, project_id, subject, summary, meta)
    values (who, 'money_limits_changed', new.id, new.project_id, new.name,
            'Ліміт витрат: ' || coalesce(old.spend_cap_usd::text, 'без ліміту') || ' → ' || coalesce(new.spend_cap_usd::text, 'без ліміту') || '; сповіщення кожні $' || new.notify_step_usd::text,
            jsonb_build_object('cap_from', old.spend_cap_usd, 'cap_to', new.spend_cap_usd, 'step_from', old.notify_step_usd, 'step_to', new.notify_step_usd));
  end if;
  if new.status is distinct from old.status then
    insert into ag_audit_log (actor, action, campaign_id, project_id, subject, summary, meta)
    values (who, 'campaign_status', new.id, new.project_id, new.name, 'Статус кампанії: ' || old.status || ' → ' || new.status, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
drop trigger if exists ag_campaigns_rights on ag_campaigns;
create trigger ag_campaigns_rights before update on ag_campaigns for each row execute function ag_campaign_rights();

-- ---- the list of approvers: only operations managers change it (the cron and the notices update other columns of this row freely)
create or replace function ag_settings_rights() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := ag_actor();
begin
  if new.approvers is distinct from old.approvers then
    if who is not null and not is_ops_manager(who) then
      raise exception 'Список утверджувачів змінюють лише операційні менеджери.' using errcode = '42501';
    end if;
    insert into ag_audit_log (actor, action, subject, summary, meta)
    values (who, 'approvers_changed', 'Утверджувачі', 'Утверджувачі: ' || coalesce(nullif(array_to_string(new.approvers, ', '), ''), 'не вказано (усі)'), jsonb_build_object('from', old.approvers, 'to', new.approvers));
  end if;
  return new;
end $$;
drop trigger if exists ai_agent_settings_rights on ai_agent_settings;
create trigger ai_agent_settings_rights before update on ai_agent_settings for each row execute function ag_settings_rights();
