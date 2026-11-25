// Who sends: the three levels of automation, per KIND of action (docs/growth-workflow.md, section 3). PURE.
//   0 «Надсилаєте ви»  — the agent prepares the text, the person copies and sends it
//   1 «Один клік»      — the person presses «Надіслати», the system sends
//   2 «Агент сам»      — the system sends by itself inside the limits
// The platform rules cap some actions (LinkedIn and Upwork forbid bots), the missing API caps others, and level 2 is unlocked only by a record of good drafts.
import { isSensitive } from './draftRules.js';

export const LEVELS = [
  { n: 0, label: 'Надсилаєте ви', hint: 'Агент готує текст, ви копіюєте й відправляєте' },
  { n: 1, label: 'Один клік', hint: 'Ви тиснете «Надіслати», система відправляє' },
  { n: 2, label: 'Агент сам', hint: 'Відправляє сам у межах ліміту, ви бачите все в журналі' },
];
export const UNLOCK_AFTER = 20; // approved drafts in a row, without a single edit of the person

// maxLevel: the highest level the platform allows; ready: is the way to send BUILT (false = only level 0, there is nothing yet that could send; `why` says it in plain words)
// Step 1 sends nothing: the letters are prepared and the person sends them. When a sender is built, its action gets ready: true.
export const ACTIONS = [
  { key: 'email_outreach', label: 'Листи потенційним клієнтам', channel: 'Email', maxLevel: 2, ready: false, why: 'Відправку з пошти підключимо наступним кроком', dailyStart: 10 },
  { key: 'linkedin_message', label: 'Повідомлення в LinkedIn', channel: 'LinkedIn', maxLevel: 0, ready: false, why: 'LinkedIn забороняє відправку програмою: надсилаєте ви', daily: 15 },
  { key: 'upwork_proposal', label: 'Відгуки на Upwork', channel: 'Upwork', maxLevel: 0, ready: false, why: 'Upwork забороняє відправку програмою: надсилаєте ви', daily: 5 },
  { key: 'social_post', label: 'Публікація постів', channel: 'Instagram, Facebook, LinkedIn', maxLevel: 2, ready: false, why: 'Чекає доступів до соцмереж' },
];
// the action of a draft by its channel
export const actionOfChannel = (channel) => ({ email: 'email_outreach', linkedin: 'linkedin_message', upwork: 'upwork_proposal' }[channel] || 'email_outreach');
export const actionOf = (key) => ACTIONS.find((a) => a.key === key) || null;

// the record of one kind of action: { streak: approved in a row without edits, unlockedAuto: the person said «yes» to level 2 }
export const emptyRecord = () => ({ streak: 0, unlockedAuto: false });
// a draft is decided: «approved as it was» extends the streak, an edit or a rejection breaks it
export function recordDecision(rec = emptyRecord(), { approved, edited }) {
  return { ...rec, streak: approved && !edited ? (rec.streak || 0) + 1 : 0 };
}

// → { allowed: [0,1,2], locked: { 1: 'why', 2: 'why' }, level } for one action, given the setting of the person
export function levelsFor(action, { level = 0, record = emptyRecord() } = {}) {
  const a = typeof action === 'string' ? actionOf(action) : action;
  if (!a) return { allowed: [0], locked: {}, level: 0 };
  const locked = {};
  if (!a.ready) { locked[1] = a.why; locked[2] = a.why; }
  else {
    if (a.maxLevel < 2) locked[2] = a.why;
    else if (!record.unlockedAuto) locked[2] = `Відкриється після ${UNLOCK_AFTER} схвалених листів поспіль без правок. Зараз ${Math.min(record.streak || 0, UNLOCK_AFTER)} із ${UNLOCK_AFTER}`;
  }
  const allowed = [0, 1, 2].filter((n) => !(n in locked));
  return { allowed, locked, level: allowed.includes(level) ? level : 0 };
}
// the person may unlock level 2 only after the record is long enough; the code checks it, not the page
export const canUnlockAuto = (rec = emptyRecord()) => (rec.streak || 0) >= UNLOCK_AFTER;

// what happens to a message right now: 'prepare' (the person sends), 'one_click' (waits for the click) or 'auto' (the system sends), with the reasons it was held back
export function sendMode(actionKey, { level = 0, record = emptyRecord(), text = '', stopped = false, sentToday = 0, quiet = false, excluded = false, action = null } = {}) {
  const a = action || actionOf(actionKey); // `action` lets a check or a future sender pass an action whose way to send is ready
  const held = [];
  if (stopped) held.push('Команду зупинено');
  if (excluded) held.push('Адресат у списку виключень');
  const eff = levelsFor(a, { level, record }).level;
  let mode = eff === 2 ? 'auto' : eff === 1 ? 'one_click' : 'prepare';
  if (mode === 'auto') {
    if (isSensitive(text)) { mode = 'one_click'; held.push('У тексті ціни, договір або гроші: тільки з вашим підтвердженням'); }
    const cap = a?.daily ?? a?.dailyStart ?? 10;
    if (sentToday >= cap) { mode = 'one_click'; held.push(`Денний ліміт ${cap} вичерпано`); }
    if (quiet) { mode = 'one_click'; held.push('Тихі години'); }
  }
  if (held.length && mode === 'prepare') mode = 'prepare';
  return { mode, held, level: eff };
}

export const QUIET = { from: 20, to: 8 }; // local hours of the lead
export function isQuietHour(date, timeZone = 'UTC') {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone }).format(date)) % 24;
  return QUIET.from > QUIET.to ? h >= QUIET.from || h < QUIET.to : h >= QUIET.from && h < QUIET.to;
}
