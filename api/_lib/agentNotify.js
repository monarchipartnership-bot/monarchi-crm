// Who is told what when the project AI agent finishes a run. The notifications go to the CRM's common
// notification bell (the `notifications` table), to the people picked in the agent's settings
// (config.notifyEmails) when «Сповістити» is on. Nobody is told about a skipped run, and a person who
// started the run by hand is not told about their own run.

// → rows for the notifications table (without sender: it is the agent user).
export function buildNotifications({ projectId, projectName, periodType, status, message, config = {}, startedBy = null }) {
  if (config.notify === false) return [];
  if (status !== 'ok' && status !== 'problem') return [];
  const recipients = [...new Set((config.notifyEmails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
    .filter((e) => !startedBy || e !== String(startedBy).toLowerCase());
  const name = projectName || `Проєкт ${projectId}`;
  const ok = status === 'ok';
  return recipients.map((email) => ({
    recipient_email: email,
    type: ok ? 'project_report' : 'project_agent_problem',
    title: ok ? 'Звіт готовий до перевірки' : 'Агент не зміг створити звіт',
    body: `${name}: ${message}`.slice(0, 400),
    link: ok ? `/projects/${projectId}?tab=${periodType}` : `/projects/${projectId}?tab=agent`,
    project_id: projectId,
  }));
}

// A problem repeats on every retry; one unread notice about it per project is enough for a while.
export const PROBLEM_QUIET_HOURS = 6;
