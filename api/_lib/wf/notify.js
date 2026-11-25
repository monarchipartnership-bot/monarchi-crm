// Notices to the manager in Telegram (step A11): something waits for the manager, a process stopped, a limit was reached.
// The chat is the one of the agent system's settings, or the chat of the notices of AI Agents (its topic «потрібна увага»).
// A notice never breaks the work: the orchestrator ignores a failure to send.
import { APPROVAL_KIND, approvalTitle } from '../../../src/lib/workflow/view.js';
import { escapeHtml } from '../telegram.js';

export const CRM_URL = 'https://crm.monarchi.agency';

// → { text (HTML), path, buttonText }
export function noticeOf({ kind, project, approvalKind, summary, projectId }) {
  const who = `<b>${escapeHtml(project)}</b>`;
  if (kind === 'approval') return { text: `🟣 ${who}: чекає на вас ${escapeHtml(approvalTitle(approvalKind))}. ${escapeHtml(APPROVAL_KIND[approvalKind]?.what || '')}`.trim(), path: '/projects/approvals', buttonText: 'Відкрити апруви' };
  if (kind === 'stopped') return { text: `🔴 ${who}: процес зупинено.\n${escapeHtml(summary || '')}`.trim(), path: '/projects/overview', buttonText: 'Відкрити огляд' };
  if (kind === 'waiting') return { text: `🟡 ${who}: крок чекає на ваші дані.\n${escapeHtml(summary || '')}`.trim(), path: `/projects/${projectId}?tab=process`, buttonText: 'Відкрити проєкт' };
  if (kind === 'auto') return { text: `🤖 ${who}: ${escapeHtml(summary || '')}`.trim(), path: `/projects/${projectId}?tab=process`, buttonText: 'Відкрити проєкт' };
  if (kind === 'cost_cap') return { text: `🟠 ${who}: досягнуто ліміт витрат агентів (${escapeHtml(summary || '')}). Кроки чекають, поки ви піднімете ліміт.`, path: '/projects/overview', buttonText: 'Відкрити огляд' };
  return { text: `${who}: ${escapeHtml(summary || '')}`, path: '/projects/overview', buttonText: 'Відкрити огляд' };
}

// send = sendMessage of api/_lib/telegram.js (or a stand-in). → async (event) => true if it was sent
export function createNotifier({ repo, send, base = CRM_URL }) {
  return async (event) => {
    const target = await repo.readNotifyTarget?.();
    if (!target?.chatId) return false;
    const p = await repo.readProject?.(event.projectId).catch(() => null);
    const n = noticeOf({ ...event, project: p?.client || p?.name || `Проєкт ${event.projectId}` });
    const r = await send({ chatId: target.chatId, threadId: target.threadId, text: n.text, url: base + n.path, buttonText: n.buttonText });
    return !!r?.ok;
  };
}

// The daily digest: the text of the overview in a message with a button. → { chatId, threadId, text, url, buttonText }
export function digestMessage(target, digest, base = CRM_URL) {
  return { chatId: target.chatId, threadId: target.threadId, text: escapeHtml(digest), url: base + '/projects/overview', buttonText: 'Відкрити огляд проєктів', silent: true };
}
