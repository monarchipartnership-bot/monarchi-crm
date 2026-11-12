// The card of a team in «Запуск AI команди» (owner, 2026-11-12): the team has a NAME of its own (shown big, with the type «Креативи» under it), and the tasks it works on are listed with
// their own names and a mark: the main regular one, an additional regular one, a seasonal one, a one-off one. Pure code: the card and the tests use it.
import { buildOperationView, isInWork, kyivToday, pausedBySeason, regularsOf, seasonOver } from './operationCycles.js';
import { creativeRunState } from './aiResults.js';

export const TASK_KIND = { main: 'Регулярне · основне', extra: 'Регулярне · додаткове', seasonal: 'Сезонне', oneoff: 'Разове' };

const dayMonth = (d) => (d ? `${String(d).slice(8, 10)}.${String(d).slice(5, 7)}` : '');

// → [{ key, kind, kindLabel, title, line, state: 'work' | 'wait' | 'paused' | 'soon', stateText, regularId?, requestId?, enabled? }] the tasks of a creative team: the regular and seasonal ones, then the
// one-off ones that are in work or wait for the person. campaign: the ag_campaigns row; cockpit: its cabinet (or null while it loads).
export function teamTasksOf({ campaign, cockpit = null, now = new Date() } = {}) {
  const view = buildOperationView({ campaign, cockpit, now });
  const today = kyivToday(now);
  const out = [];
  const plain = view.regulars.filter((r) => !r.seasonal);
  view.regulars.filter((r) => !seasonOver(r, now)).forEach((r) => {
    const seasonal = !!r.seasonal;
    const kind = seasonal ? 'seasonal' : plain[0]?.id === r.id ? 'main' : 'extra';
    const rest = !seasonal ? pausedBySeason(campaign, regularsOf(campaign).find((x) => x.id === r.id) || r, now) : null;
    let state = 'work'; let stateText = 'працює';
    if (!r.enabled) { state = 'paused'; stateText = 'зупинено'; } else if (seasonal && r.startDate && today < r.startDate) { state = 'soon'; stateText = `почнеться ${dayMonth(r.startDate)}`; } else if (rest) { state = 'paused'; stateText = `на паузі до ${dayMonth(rest.endDate)}`; }
    const period = seasonal ? `${r.startDate ? `${dayMonth(r.startDate)} – ` : 'до '}${dayMonth(r.endDate)}` : '';
    const line = [period, r.whenText, r.enabled && state !== 'paused' && r.next?.text ? `наступний запуск ${r.next.text}` : ''].filter(Boolean).join(' · ');
    out.push({ key: `reg:${r.id}`, kind, kindLabel: TASK_KIND[kind], title: r.title || 'Без назви', line, state, stateText, regularId: r.id, enabled: r.enabled });
  });
  (cockpit?.requests || []).filter((r) => r.kind !== 'regular' && (isInWork(r) || (r.creatives?.review || 0) > 0)).slice(0, 6).forEach((r) => {
    const st = creativeRunState(r);
    out.push({ key: `one:${r.id}`, kind: 'oneoff', kindLabel: TASK_KIND.oneoff, title: r.title || `Завдання №${r.id}`, line: [r.createdAt ? `${dayMonth(String(r.createdAt).slice(0, 10))}` : '', st.text].filter(Boolean).join(' · '), state: st.state === 'ok' ? 'work' : st.state, stateText: st.state === 'wait' ? 'чекає вашого рішення' : 'в роботі', requestId: r.id });
  });
  return out;
}

// The phase of a team (owner, 2026-11-12, step 3.1b): a launched team is not «працює» at once. First it PREPARES: the scout studies the site, the materials and the past ads (later also the
// style of the project and the tuning of the creator and the copywriter), and only then it works. A team that was launched before the scout existed (no profile at all) is not held back.
//   team: the entry of teamsOf (key, state)   cockpit: the cabinet of its operation (or null)
// → { phase: 'preparing' | 'running' | 'paused' | 'none', label, steps: [{ key, label, state, live }], text }
export const PHASE_LABEL = { preparing: 'підготовка', running: 'працює', paused: 'зупинено' };
export function teamPhase(team, cockpit = null) {
  const state = team?.state || 'none';
  if (state !== 'running') return { phase: state, label: PHASE_LABEL[state] || '', steps: [], text: '' };
  if (team.key === 'creative' && cockpit?.intel?.status === 'running') {
    const last = (cockpit.scoutSteps || [])[0];
    return {
      phase: 'preparing', label: PHASE_LABEL.preparing,
      steps: [{ key: 'scout', label: 'Розвідка клієнта', state: 'working', live: last?.text || 'Починає вивчати сайт і кабінет' }],
      text: 'Команда готується до роботи: вивчає сайт, матеріали й попередні реклами клієнта. Перші завдання почнуться, коли підготовка завершиться.',
    };
  }
  return { phase: 'running', label: PHASE_LABEL.running, steps: [], text: '' };
}
