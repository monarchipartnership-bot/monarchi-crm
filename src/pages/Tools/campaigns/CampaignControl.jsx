import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { addInstruction, fetchCampaignControl, removeInstruction, saveCampaignMoney, setAgentMode, setAgentSchedule } from '../../../lib/api/campaignControl';
import { AGENT_MODES, MAX_INSTRUCTION_CHARS, WEEKDAYS, describeSchedule } from '../../../lib/agents/campaignCycles';
import { fmtDateTime } from '../../Smm/agentUi';

// the dark pages of the section use the native select in the dark input style (as the campaign wizard does)
const Pick = ({ value, onChange, options, ariaLabel }) => (
  <select className="cmp-input ccx-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
);
const WEEK_OPTIONS = [{ value: '', label: 'Без розкладу' }, ...WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))];
const timeOk = (t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(t).trim());

// «Керування операцією»: what a manager decides while the campaign works — when each agent works, whether it waits for their OK or is paused, the instructions
// every agent reads, the money cap (spec 2026-11-02, §3, §5, §9). Every change goes through the server, which checks the rights and writes the journal.
export default function CampaignControl({ campaign, notify }) {
  const [confirm, confirmDialog] = useConfirm();
  const [ctl, setCtl] = useState(null);
  const [drafts, setDrafts] = useState({}); // agent id → { weekday, time }
  const [busy, setBusy] = useState('');
  const [text, setText] = useState('');
  const [role, setRole] = useState('');
  const [money, setMoney] = useState({ cap: '', step: '2' });

  const load = useCallback(async () => {
    const c = await fetchCampaignControl(campaign.id);
    setCtl(c);
    setDrafts(Object.fromEntries(c.agents.map((a) => [a.id, { weekday: a.schedule?.weekday ? String(a.schedule.weekday) : '', time: a.schedule?.time || '09:00' }])));
    setMoney({ cap: c.spendCapUsd == null ? '' : String(c.spendCapUsd), step: String(c.notifyStepUsd ?? 2) });
  }, [campaign.id]);
  useEffect(() => { load().catch((e) => notify(e.message || 'Не вдалося завантажити керування.', true)); }, [load, notify]);

  async function run(key, fn, okText) {
    setBusy(key);
    try { await fn(); await load(); if (okText) notify(okText); } catch (e) { notify(e.message || 'Не вдалося виконати.', true); } finally { setBusy(''); }
  }

  if (!ctl) return <section className="cmp-live"><div className="cmp-live-head"><h3>Керування операцією</h3></div><p className="cmp-muted">Завантаження…</p></section>;

  const changed = (a) => { const d = drafts[a.id]; return d && (d.weekday !== (a.schedule?.weekday ? String(a.schedule.weekday) : '') || (d.weekday && d.time !== (a.schedule?.time || '09:00'))); };
  const saveSchedule = (a) => {
    const d = drafts[a.id];
    if (d.weekday && !timeOk(d.time)) { notify('Час — у форматі ГГ:ХХ, наприклад 09:00.', true); return; }
    run(`sch${a.id}`, () => setAgentSchedule(a.id, d.weekday ? { weekday: Number(d.weekday), time: d.time.trim() } : null), d.weekday ? 'Розклад збережено.' : 'Агента знято з розкладу.');
  };
  const roleOptions = [{ value: '', label: 'Для всіх агентів' }, ...ctl.agents.map((a) => ({ value: a.role, label: a.name }))];
  const nameOfRole = (r) => (r ? ctl.agents.find((a) => a.role === r)?.name || r : 'усі агенти');
  const moneyChanged = money.cap !== (ctl.spendCapUsd == null ? '' : String(ctl.spendCapUsd)) || money.step !== String(ctl.notifyStepUsd ?? 2);

  async function removeIt(i) {
    if (!(await confirm({ title: 'Видалити вказівку?', body: 'Агенти більше не враховуватимуть її в наступних запусках.', confirmLabel: 'Видалити' }))) return;
    run('rm' + i, () => removeInstruction(campaign.id, ctl.instructions[i].at), 'Вказівку видалено.');
  }

  return (
    <section className="cmp-live ccx">
      <div className="cmp-live-head"><h3>Керування операцією</h3><span className="cmp-muted">Зміни діють з наступного запуску агента й записуються в журнал.</span></div>

      <h4 className="ccx-sub">Агенти: розклад і режим</h4>
      {!ctl.agents.length && <p className="cmp-muted">У цієї операції немає власних агентів (режим «Тільки креативи»): розкладу тут нема.</p>}
      {ctl.agents.length > 0 && (
        <div className="ccx-agents">
          {ctl.agents.map((a) => (
            <div className="ccx-agent" key={a.id}>
              <div className="ccx-agent-main">
                <b>{a.name}</b>
                <span className="cmp-muted">{a.nextAt ? `Наступний запуск: ${fmtDateTime(a.nextAt)} (Київ)` : a.when.charAt(0).toUpperCase() + a.when.slice(1)}{a.lastRunAt ? ` · останній: ${fmtDateTime(a.lastRunAt)}` : ''}</span>
              </div>
              <div className="ccx-modes" role="group" aria-label={`Режим: ${a.name}`}>
                {AGENT_MODES.map((m) => (
                  <button key={m.key} type="button" aria-pressed={a.mode === m.key} className={'cmp-btn' + (a.mode === m.key ? ' cmp-btn--primary' : '')} disabled={!!busy || a.mode === m.key} onClick={() => run(`mode${a.id}`, () => setAgentMode(a.id, m.key), `Режим «${m.label}»: ${a.name}.`)}>{m.label}</button>
                ))}
              </div>
              {a.schedule?.everyDays ? <p className="cmp-muted">Розклад: {describeSchedule(a.schedule)}. Змінюється в картці команди в картці проєкту.</p> : (
              <div className="ccx-sched">
                <Pick value={drafts[a.id]?.weekday ?? ''} onChange={(v) => setDrafts((d) => ({ ...d, [a.id]: { ...d[a.id], weekday: v } }))} options={WEEK_OPTIONS} ariaLabel={`День запуску: ${a.name}`} />
                {drafts[a.id]?.weekday && <input className="cmp-input ccx-time" type="text" inputMode="numeric" value={drafts[a.id].time} onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: { ...d[a.id], time: e.target.value } }))} placeholder="09:00" aria-label={`Час запуску: ${a.name}`} />}
                <button type="button" className="cmp-btn" disabled={!changed(a) || !!busy} onClick={() => saveSchedule(a)}>Зберегти розклад</button>
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h4 className="ccx-sub">Вказівки менеджера</h4>
      {!ctl.instructions.length && <p className="cmp-muted">Вказівок немає. Напишіть, на чому зосередитись, чого уникати, який тон: агенти прочитають це перед кожним запуском і виконають як важливіше за загальні правила.</p>}
      {ctl.instructions.length > 0 && (
        <ul className="ccx-instr">
          {ctl.instructions.map((it, i) => (
            <li key={it.at + i}>
              <div><span className="ccx-chip">{nameOfRole(it.role)}</span><p>{it.text}</p><small className="cmp-muted">{it.by || '—'} · {fmtDateTime(it.at)}</small></div>
              <button type="button" className="cmp-btn cmp-btn--danger" disabled={!!busy} onClick={() => removeIt(i)}>Видалити</button>
            </li>
          ))}
        </ul>
      )}
      <div className="ccx-add">
        <textarea className="cmp-input" rows={3} value={text} maxLength={MAX_INSTRUCTION_CHARS} onChange={(e) => setText(e.target.value)} placeholder="Наприклад: не згадувати знижки, акцент на преміальності, писати коротко." aria-label="Нова вказівка" />
        <div className="ccx-add-row">
          <div className="ccx-role"><Pick value={role} onChange={setRole} options={roleOptions} ariaLabel="Кому вказівка" /></div>
          <button type="button" className="cmp-btn cmp-btn--primary" disabled={text.trim().length < 3 || !!busy} onClick={() => run('add', async () => { await addInstruction(campaign.id, text, role || null); setText(''); }, 'Вказівку додано.')}>Додати вказівку</button>
        </div>
      </div>

      <h4 className="ccx-sub">Гроші</h4>
      <div className="ccx-money">
        <label>Ліміт операції, $<input className="cmp-input" type="text" inputMode="decimal" value={money.cap} onChange={(e) => setMoney((m) => ({ ...m, cap: e.target.value }))} placeholder="без ліміту" /></label>
        <label>Сповіщати кожні, $<input className="cmp-input" type="text" inputMode="decimal" value={money.step} onChange={(e) => setMoney((m) => ({ ...m, step: e.target.value }))} /></label>
        <button type="button" className="cmp-btn" disabled={!moneyChanged || !!busy} onClick={() => run('money', () => saveCampaignMoney(campaign.id, { capUsd: money.cap, stepUsd: money.step }), 'Гроші збережено.')}>Зберегти</button>
      </div>
      <p className="cmp-muted">Досягнувши ліміту, операція не запускає нових платних кроків і надсилає сповіщення. Порожнє поле — без ліміту; крок 0 вимикає сповіщення про кожні витрачені N доларів.</p>

      {confirmDialog}
    </section>
  );
}
