// Quality control of the FINISHED picture (owner's plan step 3.2, 2026-11-13). Until now the checker looked at the texts and the prompts, before any picture existed. Here the same agent (the quality checker)
// looks at the finished creative, with the words already on it, against the rules of the client's brand and the references of the client (logo, product photos). A creative with a real problem
// does not reach the manager as «fine»: it goes to «returned» with the reasons, and the manager decides (approve it anyway, or make it again, which asks the price first). Nothing is spent here
// except one look of the model (cents).
import { readJson } from './agentContent.js';
import { composeCreativeSystem } from '../../src/lib/agents/creativePrompts.js';
import { overlayFields, conceptOf } from './creativeText.js';

const MODEL = 'claude-sonnet-5';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const asList = (v) => (Array.isArray(v) ? v : []);
export const ASPECTS = { brand: 'бренд', product: 'товар', artifact: 'дефект картинки', text: 'текст', brief: 'ТЗ' };

// The verdict of the picture checker: a problem on any high issue or three medium ones, whatever the model said. → { verdict: 'pass' | 'fail', summary, issues }
export function parsePictureQc(text) {
  const j = readJson(text);
  if (!j) throw new Error('Контроль якості не повернув вердикт по картинці.');
  const issues = asList(j.issues).map((i) => ({
    aspect: ASPECTS[i?.aspect] ? i.aspect : 'artifact', severity: ['high', 'medium', 'low'].includes(i?.severity) ? i.severity : 'low', comment: clip(i?.comment, 400),
  })).filter((i) => i.comment).slice(0, 8);
  const fail = issues.some((i) => i.severity === 'high') || issues.filter((i) => i.severity === 'medium').length >= 3;
  return { verdict: fail ? 'fail' : 'pass', summary: clip(j.summary, 300), issues };
}

// The note of a returned creative: what the manager reads first.
// the details are in the verdict of the creative (shown under it), the note carries the one sentence
export const qcNote = (qc) => clip(`Контроль якості: ${qc.summary || 'є зауваження'}`, 400);

const INSTRUCTION = `### Mode: inspect ONE FINISHED creative
The LAST image is the finished creative (the words of the system may already be on it). The images before it are references of the client (logo, product photos). Check it against the concept and its words (below), the client's brand rules and restrictions (the sections above) and the references.
Real problems only: a wrong or distorted product (not like the references), a broken or altered logo, or a logo that the rules require and is missing; malformed hands, faces or objects; garbled or misspelled lettering inside the picture; the words of the system unreadable or covering the product or the logo; colours, elements, claims, prices or offers that the client's restrictions forbid or the brief does not allow. List ONLY real problems: never write an issue to say that something is fine. If everything is fine the list is empty. Be strict about facts and defects, calm about taste. Never raise what a person must decide (client approval, brand taste).
Answer with ONE JSON object: {"verdict":"pass|fail","summary":"one sentence in Ukrainian","issues":[{"aspect":"brand|product|artifact|text|brief","severity":"high|medium|low","comment":"what is wrong and where, in Ukrainian"}]}. The verdict is fail if any issue is high or there are three or more medium issues.`;

// The handler of the checker when it is asked to look at one finished picture (task.brief.trigger === 'inspect'). Everything the other agents read about the client is already in `blocks`.
// A model that cannot answer must not break the request: the result is soft (the creative simply stays without a verdict).
export async function inspectRun({ ctx, agent, task, prompt, rec, campaign, req, blocks, materials = [], mine = {}, language = 'Ukrainian', step }) {
  const { db } = ctx;
  const creativeId = Number(task.brief?.creativeId);
  const creative = creativeId ? (await db.from('ag_creatives').select('*').eq('id', creativeId).maybeSingle()).data : null;
  const url = creative?.final_url || creative?.asset_url || '';
  const soft = (why) => ({ output: { text: why, summary: why, skipped: true, inspect: true, requestId: req?.id ?? null, campaignId: campaign.id, creativeId }, summary: why });
  if (!creative || !/^https?:\/\//i.test(url)) return soft('Картинки для перевірки немає.');
  if (creative.status !== 'review') return soft('Креатив уже не на перегляді: перевірку пропущено.');
  const concept = await conceptOf(db, creative);
  const fields = overlayFields(concept, creative);
  await step('Дивлюся на готовий креатив «' + (creative.concept_name || creative.concept_key) + '» за правилами бренду', 'running');

  const refs = [...materials.filter((m) => m.kind === 'logo').slice(0, 2), ...materials.filter((m) => m.kind === 'product').slice(0, 3)].filter((m) => /^https?:\/\//i.test(m.url || ''));
  const info = [
    `Concept: ${creative.concept_name || creative.concept_key} (${creative.ratio})`,
    concept?.visual && `What the picture should show: ${clip(concept.visual, 600)}`,
    fields ? `Words put over the picture by the system: ${[fields.headline && `headline "${fields.headline}"`, fields.subline && `subline "${fields.subline}"`, fields.badge && `badge "${fields.badge}"`, fields.cta && `button "${fields.cta}"`].filter(Boolean).join(', ') || '(none)'}` : 'No words are put over this picture.',
    creative.copy?.edit ? 'A person edited the words of this creative by hand: do not judge the wording, only whether it can be read.' : '',
  ].filter(Boolean).join('\n');
  const user = [...blocks.map((x) => `### ${x.title}\n${x.text}`), `### The creative\n${info}`, INSTRUCTION].join('\n\n');
  const parts = [{ type: 'text', text: user }];
  refs.forEach((m) => parts.push({ type: 'text', text: `[Reference: ${m.kind === 'logo' ? 'logo of the client' : 'product photo of the client'}: ${clip(m.name, 80)}]` }, { type: 'image', source: { type: 'url', url: m.url } }));
  parts.push({ type: 'text', text: '[THE FINISHED CREATIVE TO CHECK]' }, { type: 'image', source: { type: 'url', url } });
  const system = composeCreativeSystem('creative_quality', prompt.body, mine.extra, language);
  let raw;
  try {
    const res = await rec.callModel({ agentKey: 'creative-creative_quality', params: { model: agent.model || MODEL, max_tokens: 1400, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: parts }] } });
    raw = String(res?.text || '').trim();
  } catch (e) { return soft('Не вдалося перевірити картинку: ' + clip(e?.message || e, 120)); }
  let parsed;
  try { parsed = parsePictureQc(raw); } catch (e) { return soft(e.message); }

  const qc = { ...parsed, source: 'picture', picture_url: url, task_id: task.id, checked_at: new Date().toISOString() };
  const patch = { qc, updated_at: qc.checked_at };
  const back = parsed.verdict === 'fail';
  if (back) { patch.status = 'rejected'; patch.note = qcNote(qc); } // the manager still decides: «Схвалити» works on a returned creative, a new picture asks the price first
  await db.from('ag_creatives').update(patch).eq('id', creative.id).eq('status', 'review');
  await step(back ? 'Контроль якості: креатив «' + (creative.concept_name || creative.concept_key) + '» повернено з зауваженнями' : 'Контроль якості: креатив «' + (creative.concept_name || creative.concept_key) + '» без зауважень', 'done');
  const text = [`## Підсумок\n${parsed.summary || (back ? 'Є зауваження.' : 'Зауважень немає.')}`, '', ...parsed.issues.map((i) => `- [${i.severity}] ${ASPECTS[i.aspect]}: ${i.comment}`)].join('\n');
  return { output: { text, summary: parsed.summary || parsed.verdict, json: { ...parsed, inspect: true, creativeId: creative.id }, inspect: true, requestId: req?.id ?? null, campaignId: campaign.id, creativeId: creative.id }, summary: `${back ? 'Повернено' : 'Без зауважень'}: ${parsed.summary || ''}` };
}
