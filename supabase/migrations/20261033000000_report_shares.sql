-- The public page of a project's reports («Історія проекту» → the client's link, /r/<token>).
-- ONE link per project + platform: it never changes when new weeks are approved, the page updates itself. «New link» revokes the old one.
-- The page is opened by a client without a password, so the browser never reads project_reports directly: it calls get_shared_report(token),
-- which hands over ONLY approved reports (plus the running month total) and strips everything internal (campaign names, review notes, who approved).
-- Additive and safe to re-run.
create table if not exists report_shares (
  id bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  platform text not null default 'all',
  token text not null unique,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_opened_at timestamptz,
  opens integer not null default 0
);
create unique index if not exists report_shares_one_active on report_shares (project_id, platform) where active;

alter table report_shares enable row level security;
drop policy if exists report_shares_select on report_shares;
drop policy if exists report_shares_insert on report_shares;
drop policy if exists report_shares_update on report_shares;
drop policy if exists report_shares_delete on report_shares;
create policy report_shares_select on report_shares for select to authenticated using (true);
create policy report_shares_insert on report_shares for insert to authenticated with check (true);
create policy report_shares_update on report_shares for update to authenticated using (true) with check (true);
create policy report_shares_delete on report_shares for delete to authenticated using (true);

-- A new link for a project + platform; the previous one stops working. Runs as the signed-in person (RLS above). → the token.
create or replace function issue_report_share(p_project bigint, p_platform text default 'all', p_by text default null)
returns text language plpgsql as $$
declare
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  update report_shares set active = false, revoked_at = now() where project_id = p_project and platform = p_platform and active;
  insert into report_shares (project_id, platform, token, created_by) values (p_project, p_platform, t, p_by);
  return t;
end $$;
revoke all on function issue_report_share(bigint, text, text) from public, anon;
grant execute on function issue_report_share(bigint, text, text) to authenticated;

-- The platforms of a report as the public page may see them: no campaigns at all, and a campaign that belongs to no group (one column of its own, or the
-- old «Інше») loses its name — the client sees «Other campaigns». Used for the report and for its previous period.
create or replace function share_strip_platforms(p jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(
    e.k,
    jsonb_set(
      e.v - 'campaigns',
      '{groups}',
      coalesce((
        select jsonb_agg(case when coalesce((gr->>'single')::boolean, false) or gr->>'name' = 'Інше' then gr || jsonb_build_object('name', 'Other campaigns') else gr end)
        from jsonb_array_elements(case when jsonb_typeof(e.v->'groups') = 'array' then e.v->'groups' else '[]'::jsonb end) gr
      ), '[]'::jsonb)
    )
  ), '{}'::jsonb)
  from jsonb_each(coalesce(p, '{}'::jsonb)) e(k, v)
$$;
revoke all on function share_strip_platforms(jsonb) from public, anon;

-- What the public page reads. NULL for an unknown or revoked token. Counts the opening.
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
          'creatives', (select coalesce(jsonb_agg(jsonb_build_object('caption', i->>'caption', 'imageUrl', i->>'imageUrl', 'kind', i->>'kind')), '[]'::jsonb) from jsonb_array_elements(coalesce(r.data->'creatives'->'items', '[]'::jsonb)) i)
        )
      ) order by r.period_start, r.period_end)
      from project_reports r
      where r.project_id = s.project_id and r.platform = s.platform
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
