-- Workflow orchestrator (step A2): the start conditions of a project, one pending approval per kind, and the atomic "take the next runs" function.

-- The conditions of the start (document, stage 0): the payment and the contracts are recorded by the manager; has_data says whether the cabinets hold data (no data: no audit).
alter table public.wf_project_state add column if not exists paid_at timestamptz;
alter table public.wf_project_state add column if not exists contracts_signed_at timestamptz;
alter table public.wf_project_state add column if not exists has_data boolean;

-- two passes of the orchestrator at the same moment cannot ask for the same approval twice
create unique index if not exists wf_approvals_one_pending_idx on public.wf_approvals (project_id, kind) where status = 'pending' and kind in ('strategy','launch');

-- Takes the next queued runs for a worker: one transaction, rows locked with "skip locked" so two workers never get the same run, a lease that frees a run whose worker died,
-- paused projects skipped, a run that lost its lease three times is failed instead of being taken again.
create or replace function public.wf_claim_runs(p_limit int default 3, p_lease_minutes int default 10)
returns setof public.wf_runs language plpgsql set search_path = public as $$
begin
  update public.wf_runs set status = 'failed', error = 'Lease expired after 3 attempts', finished_at = now(), lease_until = null
   where status = 'running' and lease_until < now() and attempt >= 3;
  return query
  with picked as (
    select r.id from public.wf_runs r
    left join public.wf_project_state s on s.project_id = r.project_id
    where (r.status = 'queued' or (r.status = 'running' and r.lease_until < now()))
      and coalesce(s.paused, false) = false
    order by r.priority, r.created_at, r.id
    limit greatest(p_limit, 0)
    for update of r skip locked
  )
  update public.wf_runs r set status = 'running', attempt = r.attempt + 1, lease_until = now() + make_interval(mins => p_lease_minutes), started_at = coalesce(r.started_at, now())
  from picked where r.id = picked.id
  returning r.*;
end $$;
revoke all on function public.wf_claim_runs(int, int) from public, anon;
grant execute on function public.wf_claim_runs(int, int) to authenticated;
