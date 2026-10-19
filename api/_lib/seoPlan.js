// The SEO agent's writing step. The checks themselves are code (seoAudit.js); the model only turns the found issues into a
// short priority plan and proposes better titles / descriptions for pages that have problems, using ONLY what the pages say.
const clip = (v, n) => String(v ?? '').trim().slice(0, n);

const SYSTEM = [
  'You are an SEO specialist for the website of Mon\'Archi, a digital marketing agency. You receive a list of issues found automatically on the public site and the text of some of its pages. Write a short plan for the person who will edit the site (WordPress).',
  'Use ONLY the data you are given. Never invent traffic numbers, rankings, keyword volumes, competitors or facts about the company. Do not promise results.',
  'Prioritise: first what blocks indexing or breaks pages, then what costs clicks (titles, descriptions), then polish. Each priority is one concrete action a person can do, with the reason in one sentence and the effort (low, medium, high).',
  'Rewrites: for up to 8 pages that have title or description problems, propose a new title (30-60 characters) and/or description (120-160 characters), based strictly on what that page says, in the language of the page, natural wording, no keyword stuffing, no claims that are not on the page.',
  'Answer with ONE JSON object and nothing else, escaping double quotes inside strings: {"summary":"2-3 sentences on the overall state","priorities":[{"title":"short action","why":"one sentence","action":"what exactly to do","effort":"low|medium|high"}],"rewrites":[{"url":"page address","field":"title|description","current":"current text","proposed":"new text"}],"notes":"what you could not judge from this data"}. At most 8 priorities.',
].join('\n');

// audit: { findings, summary }, pages: parsePage results (the worst ones get their text shown), texts: Map url -> short text
// traffic: lines handed over by the site analyst (queries with shown-but-unclicked results, pages that lost views).
export function buildPlanPrompts(siteUrl, audit, pages, texts = new Map(), traffic = []) {
  const issues = audit.findings.slice(0, 16).map((f) => `- [${f.severity}] ${f.title} (${f.count} pages)${f.pages.length ? ': ' + f.pages.slice(0, 4).join(' ; ') : ''}`).join('\n');
  const withProblems = new Set(audit.findings.filter((f) => ['title_missing', 'title_dup', 'title_len', 'desc_missing', 'desc_dup', 'desc_len', 'h1_missing'].includes(f.id)).flatMap((f) => f.pages));
  const shown = pages.filter((p) => p.status === 200 && withProblems.has(p.url)).slice(0, 8);
  const pageBlocks = shown.map((p) => `--- ${p.url}\nTitle (${p.title.length} chars): ${clip(p.title, 200) || '(none)'}\nDescription (${p.description.length} chars): ${clip(p.description, 300) || '(none)'}\nH1: ${clip(p.h1[0], 160) || '(none)'}\nPage text: ${clip(texts.get(p.url) || p.excerpt, 900)}`).join('\n\n');
  const user = [
    `Site: ${siteUrl}. Pages read: ${audit.summary.pages}; with problems of high / medium / low importance: ${audit.summary.high} / ${audit.summary.medium} / ${audit.summary.low}.`,
    `Issues found:\n${issues || '(none)'}`,
    pageBlocks ? `Pages with title or description problems:\n${pageBlocks}` : '',
    traffic.length ? `Traffic and search data from the site analyst (use it to choose what to fix first; the numbers are small, never invent others):\n${traffic.slice(0, 10).map((l) => '- ' + clip(l, 300)).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

export function parsePlan(text) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let d;
  try { d = JSON.parse(raw); } catch {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { d = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const effort = (e) => (['low', 'medium', 'high'].includes(String(e).toLowerCase()) ? String(e).toLowerCase() : 'medium');
  const out = {
    summary: clip(d.summary, 700),
    priorities: (Array.isArray(d.priorities) ? d.priorities : []).map((p) => ({ title: clip(p?.title, 140), why: clip(p?.why, 300), action: clip(p?.action, 500), effort: effort(p?.effort) })).filter((p) => p.title).slice(0, 8),
    rewrites: (Array.isArray(d.rewrites) ? d.rewrites : []).map((r) => ({ url: clip(r?.url, 300), field: ['title', 'description'].includes(r?.field) ? r.field : null, current: clip(r?.current, 300), proposed: clip(r?.proposed, 300) })).filter((r) => r.url && r.field && r.proposed).slice(0, 12),
    notes: clip(d.notes, 400),
  };
  return out.summary || out.priorities.length ? out : null;
}
