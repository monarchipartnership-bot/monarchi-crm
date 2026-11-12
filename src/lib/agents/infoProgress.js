// How full the «Інформація про проєкт» of a project card is, for the summary and the counters of the sub-sections (owner, 2026-11-12).
// Pure code: settings = the row of project_creative (with `inputs`), assets = the library of the client, accounts = project_ad_accounts rows.
//   → { sections: { client|business|competitors: { done, total }, ready: { missing } }, done, total, pct, next: null | { section, label, hint } }
import { inputState, sectionFields } from './projectCreative.js';
import { agentsNeeding, filledFields, readinessByMode } from './agentRequirements.js';

// the sub-sections that hold fields filled by agents or by hand («Бренд» belongs to «Про бізнес», as on the screen)
const SECTIONS = [['client', ['client']], ['business', ['business', 'brand']], ['competitors', ['competitors']]];
const SECTION_NAME = { client: 'Про клієнта', business: 'Про бізнес', competitors: 'Про конкурентів' };

export function infoProgress({ settings = null, assets = [], accounts = [] } = {}) {
  const inputs = settings?.inputs || {};
  const sections = {};
  let done = 0, total = 0, next = null;
  SECTIONS.forEach(([key, parts]) => {
    const fields = parts.flatMap((p) => sectionFields(p));
    const ok = fields.filter((f) => inputState(inputs[f.key]).state === 'ok');
    sections[key] = { done: ok.length, total: fields.length };
    done += ok.length; total += fields.length;
    if (!next) {
      // the first field that is empty (before a stale one) is the next step
      const wait = fields.find((f) => inputState(inputs[f.key]).state === 'wait') || fields.find((f) => inputState(inputs[f.key]).state === 'old');
      if (wait) {
        const need = agentsNeeding(wait.key);
        next = { section: key, sectionName: SECTION_NAME[key], label: wait.label, hint: need.required.length ? `Потрібне для: ${need.required.slice(0, 3).join(', ')}.` : need.recommended.length ? `Бажане для: ${need.recommended.slice(0, 3).join(', ')}.` : '' };
      }
    }
  });
  const platforms = [...new Set(accounts.map((a) => a.platform).filter((p) => p === 'meta' || p === 'google'))];
  const ready = readinessByMode(filledFields({ settings: settings || {}, assets, accounts }), platforms);
  const missing = Object.values(ready).filter((m) => m.required.length).length;
  sections.ready = { missing };
  return { sections, done, total, pct: total ? Math.round((done / total) * 100) : 0, next };
}
