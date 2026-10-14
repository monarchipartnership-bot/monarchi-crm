// The competitor agent's brain, as pure code: the prompt built from what was read on a competitor's public pages, how the
// model's answer is read back, and the short "what we know" line the content strategist later receives.
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const list = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => clip(typeof x === 'string' ? x : x?.text, len)).filter(Boolean).slice(0, n);

const SYSTEM = [
  'You are a marketing analyst for Mon\'Archi, a digital marketing agency (paid ads, reporting, creatives, automation). You study ONE competitor from the text of its public web pages and write notes for the team that runs Monarchi\'s website and social networks.',
  'Use ONLY the page text you are given. Never invent offers, prices, clients, results, team size, social following or anything else that is not written there. When something is not visible in the text write "not visible on the pages read" (or leave the list empty). Say what you could and could not see in "limits".',
  'Be specific and brief: short phrases, no marketing fluff, no judgement words like "best" or "amazing". Quote the competitor\'s own wording only in very short fragments.',
  'The opportunities and post ideas are for MONARCHI: angles it can take that are different from this competitor, never a copy of their text, and never naming the competitor in a public post.',
  'Answer with ONE JSON object and nothing else: {"positioning":"1-2 sentences: who they say they are for and what they promise","offers":["services or products they list"],"audience":"who they speak to","tone":"how they write, 1 sentence","content_themes":["topics their blog/pages cover"],"strengths":["what they do well in their content"],"weaknesses":["gaps, vague spots, what is missing"],"opportunities":["angles Monarchi can take"],"post_ideas":[{"topic":"3-8 words","angle":"1 sentence on how Monarchi would do it differently"}],"limits":"what the pages did not show"}.',
].join('\n');

export function buildAnalysisPrompts(competitor, pages) {
  const ok = pages.filter((p) => p.ok);
  const user = [
    `Competitor: ${clip(competitor.name, 120)}${competitor.website ? ` (${clip(competitor.website, 200)})` : ''}`,
    competitor.notes ? `Our own notes about them: ${clip(competitor.notes, 500)}` : '',
    ...ok.map((p, i) => `--- Page ${i + 1}: ${p.url}\nTitle: ${clip(p.title, 200)}\n${p.description ? 'Description: ' + clip(p.description, 400) + '\n' : ''}${clip(p.text, 5000)}`),
  ].filter(Boolean).join('\n\n');
  return { system: SYSTEM, user };
}

// The model's text → a clean analysis object, or null when it is not usable.
export function parseAnalysis(text) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let d;
  try { d = JSON.parse(raw); } catch {
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { d = JSON.parse(raw.slice(a, b + 1)); } catch { return null; }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const out = {
    positioning: clip(d.positioning, 500), offers: list(d.offers, 12, 160), audience: clip(d.audience, 300), tone: clip(d.tone, 300),
    content_themes: list(d.content_themes, 12, 160), strengths: list(d.strengths, 8, 240), weaknesses: list(d.weaknesses, 8, 240),
    opportunities: list(d.opportunities, 8, 240),
    post_ideas: (Array.isArray(d.post_ideas) ? d.post_ideas : []).map((p) => ({ topic: clip(p?.topic, 100), angle: clip(p?.angle, 260) })).filter((p) => p.topic).slice(0, 8),
    limits: clip(d.limits, 500),
  };
  return out.positioning || out.offers.length || out.content_themes.length ? out : null;
}

// What the content strategist is told about a competitor (short on purpose).
export function insightLine(name, analysis) {
  if (!analysis) return '';
  const bits = [
    analysis.positioning && `positioning: ${clip(analysis.positioning, 220)}`,
    analysis.content_themes?.length && `they write about: ${analysis.content_themes.slice(0, 5).join('; ')}`,
    analysis.weaknesses?.length && `gaps: ${analysis.weaknesses.slice(0, 3).join('; ')}`,
    analysis.post_ideas?.length && `ideas for us: ${analysis.post_ideas.slice(0, 3).map((p) => `${p.topic} (${p.angle})`).join('; ')}`,
  ].filter(Boolean);
  return bits.length ? `${clip(name, 80)}: ${bits.join(' | ')}` : '';
}
