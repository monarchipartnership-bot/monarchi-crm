-- Step 3.7 (owner, 2026-11-13): a creative task can be PAUSED by the manager at any moment and WAITS for the manager when an agent asks a question.
alter table ag_creative_requests drop constraint if exists ag_creative_requests_status_check;
alter table ag_creative_requests add constraint ag_creative_requests_status_check
  check (status = any (array['draft','running','review','done','problem','cancelled','paused','waiting']));

-- The quality checker only ADVISES now: the creatives it returned by itself (status rejected + its own note) go back to the manager's review.
-- Its verdict stays on the creative (qc); the note it wrote is cleared.
update ag_creatives set status = 'review', note = null, updated_at = now()
 where status = 'rejected' and note like 'Контроль якості:%' and qc->>'source' = 'picture';
