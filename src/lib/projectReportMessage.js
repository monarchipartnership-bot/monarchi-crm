// The Telegram message about a finished report of a project (sent by the project AI agent, and as a test from its settings).
// Pure code shared by the server and the tests. The text is Telegram HTML: everything that comes from outside is escaped.
//   Проєкт · Дата · Тип звіту · Статус · Потрібна дія, and under the message the button(s) that open the report in the CRM.
import { escapeHtml } from './siteLeadMessage.js';

export const REPORT_TYPE_LABEL = { weekly: 'Тижневий', monthly: 'Місячний', custom: 'Довільний' };
export const REPORT_STATUS_LABEL = { draft: 'Чернетка', reviewed: 'Перевірено', final: 'Фінал' };
const fmt = (s) => String(s || '').split('-').reverse().join('.');

// → the link of a report tab: /projects/3?tab=weekly&platform=meta ('all' = «Разом» = platform=total)
export const reportLink = (crmUrl, projectId, periodType, platform) => `${String(crmUrl || '').replace(/\/+$/, '')}/projects/${projectId}?tab=${periodType}${platform ? `&platform=${platform === 'all' ? 'total' : platform}` : ''}`;

// links: [{ label, url }] — one button each (a single link is simply «Відкрити звіт»).
// → { text, buttons: [{ text, url }] }
export function buildReportMessage({ projectName, period, periodType, status = 'draft', action, links = [], test = false }) {
  const dates = period?.start && period?.end ? (period.start === period.end ? fmt(period.start) : `${fmt(period.start)} – ${fmt(period.end)}`) : '—';
  const lines = [
    `📊 <b>${test ? 'Тест: звіт готовий до перевірки' : 'Звіт готовий до перевірки'}</b>`,
    '',
    `<b>Проєкт:</b> ${escapeHtml(projectName || '—')}`,
    `<b>Дата:</b> ${escapeHtml(dates)}`,
    `<b>Тип звіту:</b> ${escapeHtml(REPORT_TYPE_LABEL[periodType] || periodType || '—')}`,
    `<b>Статус:</b> ${escapeHtml(REPORT_STATUS_LABEL[status] || status)}`,
    `<b>Потрібна дія:</b> ${escapeHtml(action || 'Перевірити звіт')}`,
  ];
  const buttons = links.filter((l) => l?.url).map((l) => ({ text: links.length === 1 ? 'Відкрити звіт' : l.label, url: l.url }));
  return { text: lines.join('\n'), buttons };
}

// What the manager still has to do with a fresh draft: `missing` = the text blocks the agent left empty.
export function reportAction(missing = []) {
  const todo = missing.length ? `заповнити ${missing.join(' і ')}, ` : '';
  return `Перевірити цифри, ${todo}змінити статус і за потреби створити презентацію`;
}
