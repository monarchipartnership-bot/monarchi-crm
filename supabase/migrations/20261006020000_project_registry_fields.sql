-- Project registry fields (the "Project Dashboard" table): the columns that
-- did not exist on `projects` yet. The rest of the registry maps onto
-- existing columns: Проєкт = name, Статус = status, Канал роботи = services,
-- Продакт = manager, Клієнт = client, Гео = country, Початок роботи над
-- стратегією = start_date, Завершення співпраці = end_date, Особливості
-- роботи з клієнтом = notes.
-- Additive only.

alter table projects
  add column if not exists business_type text,
  add column if not exists specialist text,
  add column if not exists contacts text,
  add column if not exists timezone text,
  add column if not exists comm_start_date date,
  add column if not exists stop_reason text,
  add column if not exists payment_channel text,
  add column if not exists cost numeric,
  add column if not exists worksection_link text;
