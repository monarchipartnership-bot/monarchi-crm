// The rule of the document for competitor ads, in ONE place (used by the agent in api/_lib/wf/skills/competitorsEngine.js and by the screen):
// an ad is used as an example only when a person confirmed it in the Meta Ad Library: the link, the screenshot, the date «active since» and who checked it.
// (The official Ad Library API returns commercial ads only for the EU and the UK, so the check is made by the manager. Decision of 2026-11-19.)
export const LIBRARY_RE = /^https:\/\/(www\.)?facebook\.com\/ads\/library\//i;
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// → the list of what is missing (empty = the ad counts)
export function adProblems(a) {
  const problems = [];
  if (!LIBRARY_RE.test(String(a?.library_url || '').trim())) problems.push('немає посилання на Бібліотеку реклами');
  if (!/^https:\/\//i.test(String(a?.screenshot_url || '').trim())) problems.push('немає скриншота');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a?.active_since || '').trim())) problems.push('немає дати «активно з»');
  if (!String(a?.verified_by || '').trim()) problems.push('не вказано, хто перевірив');
  if (!clip(a?.competitor, 80)) problems.push('не вказано конкурента');
  return problems;
}
