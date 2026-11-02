-- A custom report («Показники за період» → «Зберегти») can be sent to the client by its own link, like the project's page of weeks and months.
-- The link is for ONE report (`report_id`): the page shows that report only (the numbers, texts, creatives and funnel as the team saved them, with everything internal stripped).
-- A project link (report_id is null) is exactly as before and still never shows a custom report. Additive and safe to re-run.
alter table report_shares add column if not exists report_id bigint references project_reports(id) on delete cascade;

-- one active project link per project + platform (as before), and one active link per custom report
drop index if exists report_shares_one_active;
create unique index if not exists report_shares_one_active on report_shares (project_id, platform) where active and report_id is null;
create unique index if not exists report_shares_one_active_report on report_shares (report_id) where active and report_id is not null;

-- the project link keeps replacing only the project link
create or replace function issue_report_share(p_project bigint, p_platform text default 'all', p_by text default null)
returns text language plpgsql as $$
declare
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update report_shares set active = false, revoked_at = now() where project_id = p_project and platform = p_platform and active and report_id is null;
  insert into report_shares (project_id, platform, token, created_by) values (p_project, p_platform, t, p_by);
  return t;
end $$;
revoke all on function issue_report_share(bigint, text, text) from public, anon;
grant execute on function issue_report_share(bigint, text, text) to authenticated;

-- A new link for one custom report; its previous link stops working. → the token. Only custom reports can be shared this way.
create or replace function issue_report_share_for_report(p_report bigint, p_by text default null)
returns text language plpgsql as $$
declare
  r project_reports%rowtype;
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  select * into r from project_reports where id = p_report;
  if not found then raise exception 'Report not found'; end if;
  if r.period_type <> 'custom' then raise exception 'Only a custom report has its own link'; end if;
  update report_shares set active = false, revoked_at = now() where report_id = p_report and active;
  insert into report_shares (project_id, platform, token, created_by, report_id) values (r.project_id, r.platform, t, p_by, p_report);
  return t;
end $$;
revoke all on function issue_report_share_for_report(bigint, text) from public, anon;
grant execute on function issue_report_share_for_report(bigint, text) to authenticated;

-- What the public page reads. A report link hands over that one report (any status: the team chose to send it); a project link as before.
create or replace function get_shared_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s report_shares%rowtype;
  proj record;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into s from report_shares where token = p_token and active;
  if not found then return null; end if;
  update report_shares set opens = opens + 1, last_opened_at = now() where id = s.id;
  select name, business_type into proj from projects where id = s.project_id;

  select jsonb_build_object(
    'project', jsonb_build_object('name', coalesce(proj.name, ''), 'kind', case when proj.business_type = 'Проєкти лідогенерації' then 'leadgen' else 'ecom' end),
    'platform', s.platform,
    'single', s.report_id is not null,
    'columns', coalesce((select to_jsonb(c.columns) from project_report_columns c where c.project_id = s.project_id and c.platform = s.platform), '[]'::jsonb),
    'custom', coalesce((select jsonb_agg(jsonb_build_object('key', m.key, 'name', m.name, 'formula', m.formula, 'format', m.format)) from report_custom_metrics m where m.project_id = s.project_id or m.project_id is null), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'type', r.period_type,
        'start', r.period_start,
        'end', r.period_end,
        'status', r.status,
        'updatedAt', r.updated_at,
        'toDate', coalesce((r.data->>'toDate')::boolean, false),
        'data', jsonb_build_object(
          'kind', r.data->'kind',
          'label', r.data->'label',
          'platforms', share_strip_platforms(r.data->'platforms'),
          'previous', case when r.data->'previous' is null or jsonb_typeof(r.data->'previous') <> 'object' then null else jsonb_build_object(
            'period', r.data->'previous'->'period',
            'platforms', share_strip_platforms(r.data->'previous'->'platforms')) end,
          'sections', coalesce(r.data->'sections', '{}'::jsonb),
          'template', r.data->'template',
          'creatives', (select coalesce(jsonb_agg(jsonb_build_object('caption', i->>'caption', 'imageUrl', i->>'imageUrl', 'kind', i->>'kind')), '[]'::jsonb) from jsonb_array_elements(coalesce(r.data->'creatives'->'items', '[]'::jsonb)) i)
        )
      ) order by r.period_start, r.period_end)
      from project_reports r
      where r.project_id = s.project_id
        and (
          -- a report link: that report only
          (s.report_id is not null and r.id = s.report_id)
          -- a project link: the platform's approved reports (custom ones are internal), plus the running total of a month that has an approved week
          or (s.report_id is null and r.platform = s.platform and r.period_type <> 'custom' and (
            r.status = 'final'
            or (coalesce((r.data->>'toDate')::boolean, false) and exists (
              select 1 from project_reports w
              where w.project_id = r.project_id and w.platform = r.platform and w.period_type = 'weekly' and w.status = 'final'
                and to_char(w.period_start, 'YYYY-MM') = to_char(r.period_start, 'YYYY-MM')))
          ))
        )
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function get_shared_report(text) from public;
grant execute on function get_shared_report(text) to anon, authenticated;
