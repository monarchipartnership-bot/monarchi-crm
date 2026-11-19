-- Workflow foundation (step A1 of the plan; spec: the document "Робочий процес клієнта").
-- The dossier of a project with versions, the pool of tasks, the runs of the agents with their steps, the approvals, the journal and the state of each project.
-- Everything is for signed-in users only: the anon role has no rights on these tables and no policy names the public role.
-- Versions and the journal only grow: no update and no delete for anyone.

create table if not exists public.wf_project_state (
  project_id bigint primary key references public.projects(id) on delete cascade,
  stage smallint not null default 0 check (stage between 0 and 5),
  paused boolean not null default false,
  paused_reason text,
  cost_cap_usd numeric(10,2) check (cost_cap_usd is null or cost_cap_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.wf_project_state is 'Where each project is in the process (stage 0-5), its pause and its own cost cap.';

create table if not exists public.wf_runs (
  id bigserial primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  agent text not null check (agent in ('researcher','creator','strategist','mediabuyer','support')),
  skill text not null check (length(skill) > 0),
  trigger text not null default 'manual' check (trigger in ('auto','schedule','event','manual')),
  status text not null default 'queued' check (status in ('queued','running','waiting','done','failed','cancelled')),
  priority smallint not null default 100,
  input jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  output jsonb,
  step int not null default 0,
  attempt smallint not null default 0,
  lease_until timestamptz,
  error text,
  cost_usd numeric(10,4) not null default 0,
  parent_run_id bigint references public.wf_runs(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
comment on table public.wf_runs is 'One run of an agent skill for one project. The queue is the rows that are queued or running; a lease keeps two workers off one run; state lets a long run continue in steps.';
create index if not exists wf_runs_queue_idx on public.wf_runs (status, priority, created_at) where status in ('queued','running');
create index if not exists wf_runs_project_idx on public.wf_runs (project_id, created_at desc);
-- one open run per project, agent and skill: a repeated trigger cannot start the same work twice
create unique index if not exists wf_runs_one_open_idx on public.wf_runs (project_id, agent, skill) where status in ('queued','running','waiting');

create table if not exists public.wf_run_steps (
  id bigserial primary key,
  run_id bigint not null references public.wf_runs(id) on delete cascade,
  n int not null,
  title text not null,
  status text not null default 'done' check (status in ('running','done','failed','info')),
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
comment on table public.wf_run_steps is 'The live steps of a run (what the manager sees as "Хід роботи") with the exact prompts and answers in detail.';
create index if not exists wf_run_steps_run_idx on public.wf_run_steps (run_id, n);

create table if not exists public.wf_sections (
  id bigserial primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  key text not null check (key in ('brief','audit','site','audience','unit_economy','competitors','materials','ideas','strategy','monthly_plan')),
  status text not null default 'empty' check (status in ('empty','in_progress','draft','on_approval','approved','needs_rework')),
  needs_reapproval boolean not null default false,
  current_version_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);
comment on table public.wf_sections is 'The sections of the dossier of a project. The text lives in versions; current_version_id points to the one that counts.';

create table if not exists public.wf_section_versions (
  id bigserial primary key,
  section_id bigint not null references public.wf_sections(id) on delete cascade,
  version int not null,
  content jsonb not null default '{}'::jsonb,
  body text not null default '',
  author_kind text not null check (author_kind in ('agent','human')),
  author text not null,
  is_proposal boolean not null default false,
  run_id bigint references public.wf_runs(id) on delete set null,
  sources jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  unique (section_id, version)
);
comment on table public.wf_section_versions is 'Every edit is a new version with its author. An agent may not replace a human or an approved version: it sends a proposal (is_proposal) that does not become current.';
do $fk$ begin
  if not exists (select 1 from pg_constraint where conname = 'wf_sections_current_version_fk') then
    alter table public.wf_sections add constraint wf_sections_current_version_fk foreign key (current_version_id) references public.wf_section_versions(id) on delete set null;
  end if;
end $fk$;

create or replace function public.wf_version_before() returns trigger language plpgsql set search_path = public as $$
declare sec public.wf_sections%rowtype;
begin
  select * into sec from public.wf_sections where id = new.section_id for update; -- also serialises the versions of one section
  if not found then raise exception 'wf: section % not found', new.section_id; end if;
  if new.version is null or new.version = 0 then
    select coalesce(max(version), 0) + 1 into new.version from public.wf_section_versions where section_id = new.section_id;
  end if;
  if new.author_kind = 'agent' and not new.is_proposal then
    if sec.status in ('approved','on_approval') or exists (select 1 from public.wf_section_versions v where v.section_id = new.section_id and v.author_kind = 'human' and not v.is_proposal) then
      raise exception 'wf: an agent may not replace a human or approved version of section %; send a proposal instead', new.section_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.wf_version_after() returns trigger language plpgsql set search_path = public as $$
begin
  if not new.is_proposal then
    update public.wf_sections s set
      current_version_id = new.id,
      updated_at = now(),
      needs_reapproval = s.needs_reapproval or (new.author_kind = 'human' and s.status = 'approved'),
      status = case when new.author_kind = 'human' and s.status = 'approved' then 'draft' when s.status = 'empty' then 'draft' else s.status end
    where s.id = new.section_id;
  end if;
  return null;
end $$;

drop trigger if exists wf_version_before_trg on public.wf_section_versions;
create trigger wf_version_before_trg before insert on public.wf_section_versions for each row execute function public.wf_version_before();
drop trigger if exists wf_version_after_trg on public.wf_section_versions;
create trigger wf_version_after_trg after insert on public.wf_section_versions for each row execute function public.wf_version_after();

create table if not exists public.wf_tasks (
  id bigserial primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  type text not null check (type in ('site','creatives','ads','tracking','brand','client')),
  title text not null check (length(title) > 0),
  evidence text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  owner text not null default 'manager' check (owner in ('agent','manager','client','client_dev')),
  status text not null default 'proposed' check (status in ('proposed','approved','in_progress','done','rejected')),
  source_section_id bigint references public.wf_sections(id) on delete set null,
  created_by_kind text not null default 'agent' check (created_by_kind in ('agent','human')),
  created_by text,
  due_date date,
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.wf_tasks is 'The pool of tasks of a project (site, creatives, ads, tracking, brand, and what the client owes us) with evidence, priority and owner.';
create index if not exists wf_tasks_project_idx on public.wf_tasks (project_id, status);

create table if not exists public.wf_approvals (
  id bigserial primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('strategy','launch','changes','client')),
  subject jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','returned')),
  requested_by text,
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  comment text,
  check ((status = 'pending') = (decided_at is null)),
  check (status <> 'returned' or length(coalesce(comment, '')) > 0)
);
comment on table public.wf_approvals is 'The approvals of the manager (strategy, launch, changes) and the sign-off of the client. A returned approval needs a comment.';
create index if not exists wf_approvals_project_idx on public.wf_approvals (project_id, status);

create table if not exists public.wf_journal (
  id bigserial primary key,
  project_id bigint not null references public.projects(id) on delete cascade,
  at timestamptz not null default now(),
  actor_kind text not null check (actor_kind in ('agent','human','system')),
  actor text not null,
  action text not null,
  subject text,
  summary text not null default '',
  meta jsonb not null default '{}'::jsonb
);
comment on table public.wf_journal is 'Every decision and every change: what, when, why, by whom. It only grows.';
create index if not exists wf_journal_project_idx on public.wf_journal (project_id, at desc);

-- access: signed-in users only; versions and the journal never change
do $acc$
declare t text;
begin
  foreach t in array array['wf_project_state','wf_runs','wf_run_steps','wf_sections','wf_tasks','wf_approvals','wf_section_versions','wf_journal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from public', t);
    execute format('revoke all on public.%I from authenticated', t); -- the platform grants everything by default: take it back, then give only what is needed
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)', t || '_insert', t);
    if t in ('wf_section_versions','wf_journal') then
      execute format('grant select, insert on public.%I to authenticated', t);
    else
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('drop policy if exists %I on public.%I', t || '_update', t);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
      execute format('drop policy if exists %I on public.%I', t || '_delete', t);
      execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete', t);
    end if;
  end loop;
end $acc$;
revoke all on sequence public.wf_runs_id_seq, public.wf_run_steps_id_seq, public.wf_sections_id_seq, public.wf_section_versions_id_seq, public.wf_tasks_id_seq, public.wf_approvals_id_seq, public.wf_journal_id_seq from anon;
grant usage, select on sequence public.wf_runs_id_seq, public.wf_run_steps_id_seq, public.wf_sections_id_seq, public.wf_section_versions_id_seq, public.wf_tasks_id_seq, public.wf_approvals_id_seq, public.wf_journal_id_seq to authenticated;
