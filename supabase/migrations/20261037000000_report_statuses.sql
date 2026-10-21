-- Report statuses become: draft (Чернетка, in «Робота над звітами»), rework (Доробка, returned from the history), final (Затверджено: in the history and for the client).
-- «reviewed» (На затвердженні) is gone from the screens; the value stays allowed so a version of the site that still writes it keeps working during the switch,
-- and the reports that were waiting for approval become drafts.
alter table project_reports drop constraint if exists project_reports_status_check;
alter table project_reports add constraint project_reports_status_check check (status in ('draft', 'reviewed', 'rework', 'final'));
update project_reports set status = 'draft' where status = 'reviewed';
