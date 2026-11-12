// The blocks of the agents under the scheme of a creative task (owner, 2026-11-12, «схема и отдельно блоки с информацией»): for every agent of the chain what it does, what it
// produced and passed on, why it waits, how long and how much. Pure code: the card of the task and the tests use it. The data is the stages of lib/agents/projectCockpit.js
// (buildStages) with the fields of the newest task of each role.

// what each agent does, in plain words (the same for every task; what it made is in `result`)
export const STAGE_WORK = {
  scout: 'Вивчає сайт клієнта (товари, ціни, тон, фото) і найкращі реклами з кабінету, складає профіль клієнта, який читають усі агенти.',
  strategy: 'Складає напрями за описом завдання, карткою проєкту й памʼяттю про клієнта.',
  brief: 'Перетворює напрями на технічне завдання для картинок: композиція, світло, що показати.',
  copy: 'Пише тексти до кожного напряму.',
  maker: 'Готує картинки за технічним завданням і запускає їх генерацію в межах ліміту.',
  quality: 'Перевіряє картинки й тексти на відповідність ТЗ та правилам клієнта.',
};
// who gets the result
// the steps whose result the manager may correct with a comment (the agent makes it again, the agents below follow)
export const REVISABLE_STAGES = ['strategy', 'brief', 'copy', 'maker'];
export const STAGE_PASSES = { scout: ['strategy'], strategy: ['brief'], brief: ['copy', 'maker'], copy: ['quality'], maker: ['quality'], quality: ['you'] };
// who it waits for
const STAGE_NEEDS = { brief: ['strategy'], copy: ['brief'], maker: ['brief'], quality: ['copy', 'maker'] };
const STATE_LABEL = { done: 'готово', working: 'працює', waiting: 'у черзі', failed: 'помилка', idle: 'ще не почав' };
const TONE = { done: 'ok', working: 'work', waiting: 'grey', failed: 'bad', idle: 'grey' };
const at = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? 0 : t; };

export const durationText = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `${Math.round(sec)} с`;
  const m = Math.floor(sec / 60); const s = Math.round(sec % 60);
  return s ? `${m} хв ${s} с` : `${m} хв`;
};

// stages: [{ key, label, state, note, taskId, startedAt, finishedAt, costUsd, summary }]; paused: the operation is stopped
// → [{ key, label, state, stateLabel, tone, work, result, passed, why, startedAt, finishedAt, duration, costUsd, taskId, error }] for the agents (the step «Ви» is not a card)
export function buildStepCards({ stages = [], paused = false } = {}) {
  const by = new Map(stages.map((s) => [s.key, s]));
  const label = (k) => (k === 'you' ? 'вам на перевірку' : by.get(k)?.label || k);
  const names = (keys) => keys.map(label).join(' і ');
  return stages.filter((s) => s.key !== 'you').map((s) => {
    const passes = STAGE_PASSES[s.key] || [];
    const missing = (STAGE_NEEDS[s.key] || []).filter((k) => by.get(k)?.state !== 'done');
    let why = '';
    if (s.state === 'working') why = 'Працює зараз.';
    else if (s.state === 'failed') why = s.note || 'Крок завершився помилкою.';
    else if (s.state === 'waiting' || s.state === 'idle') {
      if (paused) why = 'Команда на паузі: нові кроки не запускаються, поки її не продовжити.';
      else if (missing.length) why = `Чекає на результат: ${names(missing)}.`;
      else why = s.state === 'waiting' ? 'У черзі: запуститься найближчим часом.' : 'Почне, коли дійде черга.';
    }
    const dur = s.startedAt && s.finishedAt ? (at(s.finishedAt) - at(s.startedAt)) / 1000 : 0;
    return {
      key: s.key, label: s.label, state: s.state, stateLabel: STATE_LABEL[s.state] || s.state, tone: TONE[s.state] || 'grey',
      work: STAGE_WORK[s.key] || '', result: s.state === 'done' ? String(s.summary || '').trim() : '',
      passed: passes.length ? `${s.state === 'done' ? 'Передано' : 'Передасть'}: ${names(passes)}` : '', why,
      canRevise: s.state === 'done' && REVISABLE_STAGES.includes(s.key) && s.taskId != null,
      startedAt: s.startedAt || null, finishedAt: s.finishedAt || null, duration: durationText(dur), costUsd: Number(s.costUsd) || 0, taskId: s.taskId ?? null, error: s.state === 'failed' ? s.note || '' : '',
    };
  });
}
