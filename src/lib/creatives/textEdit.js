// The words of ONE ready creative changed by a person without making the picture again (owner, 2026-11-13, step 3.1e). The edit lives in the creative itself (ag_creatives.copy.edit) and wins over
// the words of the technical brief and the copywriter and over the style of the task. Pure code: the server and the editor use it.
import { cleanManual } from '../agents/projectStyle.js';

export const TEXT_EDIT_LIMITS = { headline: 90, subline: 120, badge: 40, cta: 28 };
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// raw: what the editor sends { headline?, subline?, badge?, cta?, style?: { text: {...} } } → the clean edit, or null when it changes nothing.
// A field that is NOT in the edit stays as the agents made it; a field that is in it but empty is taken off the picture (an empty button = no button).
export function cleanTextEdit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  Object.entries(TEXT_EDIT_LIMITS).forEach(([k, n]) => { if (typeof raw[k] === 'string') out[k] = clip(raw[k], n); });
  const text = cleanManual({ text: raw.style?.text }).text;
  if (Object.keys(text).length) out.style = { text };
  return Object.keys(out).length ? out : null;
}
