-- Task Manager: departments + per-department task stage pipelines + per-
-- department task categories, replacing tasks.department (free text) and
-- tasks.status (fixed pending/done/cancelled) with department_id/stage_id —
-- same model as deals' pipelines/deal_stages (pipelines.id/deal_stages.id
-- are plain bigint identity, not uuid — matched here for consistency).
-- Run this once in the Supabase SQL editor for this project.
--
-- Verified before writing this: `SELECT DISTINCT department FROM tasks`
-- returns only 'sales' (14 rows, 7 of them tied to a deal/client) and
-- 'automation' (23 rows, none tied to a deal/client) — despite code
-- comments elsewhere mentioning a "PM department", no such rows exist yet.

create table if not exists departments (
  id bigint generated always as identity primary key,
  name text not null,
  color text not null default '#7C3AED',
  icon text,
  position int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists task_stages (
  id bigint generated always as identity primary key,
  label text not null,
  color text not null default '#7C3AED',
  position int not null default 1,
  department_id bigint not null references departments(id) on delete cascade,
  is_done boolean not null default false,
  is_cancelled boolean not null default false
);
create index if not exists task_stages_department_id_idx on task_stages(department_id);

create table if not exists task_categories (
  id bigint generated always as identity primary key,
  label text not null,
  color text not null default '#7C3AED',
  department_id bigint not null references departments(id) on delete cascade
);
create index if not exists task_categories_department_id_idx on task_categories(department_id);

-- `department` (text) and `status` (text) columns on `tasks` are left as-is
-- — kept as a legacy fallback for any row that never gets backfilled, and
-- kept in sync going forward by moveTaskStage() for any code that still
-- reads them directly.
alter table tasks add column if not exists department_id bigint references departments(id);
alter table tasks add column if not exists stage_id bigint references task_stages(id);
create index if not exists tasks_department_id_idx on tasks(department_id);
create index if not exists tasks_stage_id_idx on tasks(stage_id);

-- Seed the two departments that already exist as free-text values today.
insert into departments (name, color, icon, position) values
  ('Sales відділ', '#7C3AED', 'briefcase', 1),
  ('Відділ автоматизації', '#2563EB', 'automation', 2);

-- Default 5-stage template per department — mirrors pipelines.js's
-- DEFAULT_STAGE_TEMPLATE convention: exactly one is_done, one is_cancelled.
insert into task_stages (label, color, position, department_id, is_done, is_cancelled)
select s.label, s.color, s.position, d.id, s.is_done, s.is_cancelled
from departments d
cross join (values
  ('До виконання', '#7C3AED', 1, false, false),
  ('В роботі', '#2F80ED', 2, false, false),
  ('На перевірці', '#B8860B', 3, false, false),
  ('Виконано', '#1E9E5D', 4, true, false),
  ('Скасовано', '#D14343', 5, false, true)
) as s(label, color, position, is_done, is_cancelled)
where d.name in ('Sales відділ', 'Відділ автоматизації');

-- Automation's starter categories come from the existing global BASE_TAGS
-- (src/lib/tagColors.js) so nothing currently tagged loses its category.
insert into task_categories (label, color, department_id)
select c.label, c.color, d.id
from departments d
cross join (values
  ('Bot', '#6B2FA0'), ('CRM', '#1E9E5D'), ('Reports', '#2F80ED'), ('Automation', '#B8860B')
) as c(label, color)
where d.name = 'Відділ автоматизації';

-- Sales gets a small starter set — easy to extend later via the UI.
insert into task_categories (label, color, department_id)
select c.label, c.color, d.id
from departments d
cross join (values ('Клієнт', '#7C3AED'), ('Внутрішнє', '#2F80ED')) as c(label, color)
where d.name = 'Sales відділ';

-- Backfill department_id — deal/client-tied tasks (deal_id or client_id set)
-- ALWAYS stay department_id = NULL regardless of their old department
-- string, since they belong to DealTasksPage, not Task Manager.
update tasks set department_id = (select id from departments where name = 'Sales відділ')
where department = 'sales' and deal_id is null and client_id is null;

update tasks set department_id = (select id from departments where name = 'Відділ автоматизації')
where department = 'automation' and deal_id is null and client_id is null;

-- Backfill stage_id best-effort from the old status column (done → that
-- department's is_done stage, cancelled → its is_cancelled stage, anything
-- else → its first/position-1 stage).
update tasks t set stage_id = (
  select ts.id from task_stages ts where ts.department_id = t.department_id and ts.is_done = true
)
where t.department_id is not null and t.status = 'done';

update tasks t set stage_id = (
  select ts.id from task_stages ts where ts.department_id = t.department_id and ts.is_cancelled = true
)
where t.department_id is not null and t.status = 'cancelled';

update tasks t set stage_id = (
  select ts.id from task_stages ts where ts.department_id = t.department_id and ts.position = 1
)
where t.department_id is not null and t.stage_id is null;

-- RLS — same read-open/write-authenticated pattern as every other table
-- (see 2026-09-19_enable_rls_everywhere.sql), extended to the 3 new tables.
do $$
declare
  t text;
  tables text[] := array['departments', 'task_stages', 'task_categories'];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format('create policy %I on %I for select using (true)', t || '_select', t);

    execute format('drop policy if exists %I on %I', t || '_insert', t);
    execute format('create policy %I on %I for insert with check (auth.role() = ''authenticated'')', t || '_insert', t);

    execute format('drop policy if exists %I on %I', t || '_update', t);
    execute format('create policy %I on %I for update using (auth.role() = ''authenticated'')', t || '_update', t);

    execute format('drop policy if exists %I on %I', t || '_delete', t);
    execute format('create policy %I on %I for delete using (auth.role() = ''authenticated'')', t || '_delete', t);
  end loop;
end $$;
