-- Custom reports («Показники за період» → «Зберегти») have no draft/rework: they are saved as final and are only for the team (history → «Кастомні звіти»).
-- The client's page never receives them.
update project_reports set status = 'final' where period_type = 'custom' and status <> 'final';

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
      where r.project_id = s.project_id and r.platform = s.platform
        and r.period_type <> 'custom' -- custom reports are internal: they are never shown to the client
        and (
          r.status = 'final'
          -- the running total of a month shows only while the month has at least one approved week
          or (coalesce((r.data->>'toDate')::boolean, false) and exists (
            select 1 from project_reports w
            where w.project_id = r.project_id and w.platform = r.platform and w.period_type = 'weekly' and w.status = 'final'
              and to_char(w.period_start, 'YYYY-MM') = to_char(r.period_start, 'YYYY-MM')))
        )
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function get_shared_report(text) from public;
grant execute on function get_shared_report(text) to anon, authenticated;
