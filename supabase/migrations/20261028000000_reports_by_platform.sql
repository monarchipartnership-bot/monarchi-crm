-- Project reports and campaign groups are now kept PER AD PLATFORM (Meta, Google, later TikTok...), plus one «Разом» scope.
--   project_reports.platform          'meta' | 'google' | ... = a report of that platform only; 'all' = «Разом» (every platform together)
--   project_campaign_groups.platform  the platform whose campaigns the group holds (null = old group, shown in every platform tab)
-- The report key becomes (project, period type, period start, platform). Additive; safe to re-run.

alter table project_reports add column if not exists platform text not null default 'all';
alter table project_reports drop constraint if exists project_reports_project_id_period_type_period_start_key;
create unique index if not exists project_reports_scope_uniq on project_reports (project_id, period_type, period_start, platform);

-- A project with a single platform has no separate «Разом»: its old combined reports belong to that platform.
do $$
declare r record; keys text[];
begin
  for r in select id, data from project_reports where platform = 'all' and jsonb_typeof(data -> 'platforms') = 'object' loop
    select array_agg(k) into keys from jsonb_object_keys(r.data -> 'platforms') k;
    if array_length(keys, 1) = 1 then
      begin
        update project_reports set platform = keys[1] where id = r.id;
      exception when unique_violation then null;
      end;
    end if;
  end loop;
end $$;

alter table project_campaign_groups add column if not exists platform text;

-- Groups that name campaigns: the platform is in their keys ('meta|...'). One platform → set it; several → one copy per platform.
do $$
declare g record; plats text[]; p text; first boolean;
begin
  for g in select * from project_campaign_groups where platform is null and cardinality(campaigns) > 0 loop
    select array_agg(distinct split_part(c, '|', 1)) into plats from unnest(g.campaigns) c;
    first := true;
    foreach p in array plats loop
      if first then
        update project_campaign_groups set platform = p, campaigns = array(select c from unnest(g.campaigns) c where split_part(c, '|', 1) = p) where id = g.id;
        first := false;
      else
        insert into project_campaign_groups (project_id, name, keywords, campaigns, sort, platform)
        values (g.project_id, g.name, '{}', array(select c from unnest(g.campaigns) c where split_part(c, '|', 1) = p), g.sort, p);
      end if;
    end loop;
  end loop;
end $$;

-- Old keyword groups were made while looking at Meta (RTS / MTO naming): they move there. Recreate them in another tab if needed.
update project_campaign_groups set platform = 'meta' where platform is null;
