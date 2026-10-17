-- Storage for the pictures and videos the visual agent generates (the provider keeps its files only 7 days).
-- Public read (a post preview is just an image link), writes only for signed-in team members. Safe to re-run.
insert into storage.buckets (id, name, public) values ('smm-assets', 'smm-assets', true) on conflict (id) do nothing;

drop policy if exists smm_assets_insert on storage.objects;
drop policy if exists smm_assets_update on storage.objects;
drop policy if exists smm_assets_select on storage.objects;
create policy smm_assets_insert on storage.objects for insert to authenticated with check (bucket_id = 'smm-assets');
create policy smm_assets_update on storage.objects for update to authenticated using (bucket_id = 'smm-assets') with check (bucket_id = 'smm-assets');
create policy smm_assets_select on storage.objects for select to authenticated using (bucket_id = 'smm-assets');
