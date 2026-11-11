import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { supabase } from '../../../lib/supabaseClient';
import { addInstruction, fetchCampaignControl, removeInstruction, saveCampaignMoney, setAgentMode, setAgentSchedule } from '../../../lib/api/campaignControl';
import { setTeamRunning } from '../../../lib/api/teams';
import { AGENT_MODES, MAX_EVERY_DAYS, MAX_INSTRUCTION_CHARS, WEEKDAYS, cleanSchedule, describeSchedule } from '../../../lib/agents/campaignCycles';
import { CAMPAIGN_ROLES } from '../../../lib/agents/campaignTeam';
import { teamReadiness, teamRoles } from '../../../lib/agents/teams';
import { fmtDateTime } from '../../../pages/Smm/agentUi';

const STATE = { running: ['працює', 'is-ok'], paused: ['зупинено', 'is-wait'] };
const LAST = { ok: 'успішно', failed: 'помилка', running: 'працює зараз' };
const shortOf = (role) => CAMPAIGN_ROLES.find((r) => r.role === role)?.short || '';
const fromSchedule = (s) => (s?.everyDays ? { mode: 'every', every: String(s.everyDays), weekday: '1', time: s.time || '09:00' } : s?.weekday ? { mode: 'week', every: '3', weekday: String(s.weekday), time: s.time || '09:00' } : { mode: 'manual', every: '3', weekday: '1', time: '09:00' });
const toSchedule = (d) => (d.mode === 'every' ? { everyDays: Number(d.every), time: d.time } : d.mode === 'week' ? { weekday: Number(d.weekday), time: d.time } : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The card of a running team of an operation (owner, 2026-11-11): stop or resume the whole team and each agent, when each agent works (every N days / weekly / after the
// others), what the agents read from the card of the project and what is still missing there, the instructions of the manager and the money. Hub light look; every change goes
// through the server that checks the rights and writes the journal.
//   team: from teamsOf (key, def, state, campaign)   data: fetchTeamsData result (for the check)   onGoFill(section): opens that section of the card   onChanged(): the list is read again
export default function TeamCard({ team, data, onClose, onChanged, onGoFill, say }) {
  const box = useRef(null);
  useDialogA11y(box, onClose);
  const campaign = team.campaign;
  const [ctl, setCtl] = useState(null);
  const [spent, setSpent] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [state, setState] = useState(team.state);
  const [text, setText] = useState('');
  const [role, setRole] = useState('');
  const [cap, setCap] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([fetchCampaignControl(campaign.id), supabase.from('ag_campaign_spend').select('claude_usd, higgsfield_usd').eq('campaign_id', campaign.id).maybeSingle().then((r) => r.data || null)]);
    setCtl(c); setSpent(s);
    setDrafts(Object.fromEntries(c.agents.map((a) => [a.id, fromSchedule(a.schedule)])));
    setCap(c.spendCapUsd == null ? '' : String(c.spendCapUsd));
  }, [campaign.id]);
  useEffect(() => { load().catch((e) => setError(e?.message || 'Не вдалося завантажити команду.')); }, [load]);

  async function run(key, fn, ok) {
    setBusy(key); setError('');
    try { await fn(); await load(); onChanged?.(); if (ok) say?.(ok); } catch (e) { setError(e?.message || 'Не вдалося виконати.'); } finally { setBusy(''); }
  }
  const toggleTeam = () => run('team', async () => { const next = state !== 'running'; await setTeamRunning({ key: team.key, campaign }, next); setState(next ? 'running' : 'paused'); }, state === 'running' ? 'Команду зупинено.' : 'Команду продовжено.');
  const patch = (id, p) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));
  const saveSchedule = (a) => {
    let schedule;
    try { schedule = toSchedule(drafts[a.id]); if (schedule) schedule = cleanSchedule(schedule); } catch (e) { setError(e.message); return; }
    run('sch' + a.id, () => setAgentSchedule(a.id, schedule), schedule ? `Розклад «${a.name}»: ${describeSchedule(schedule)}.` : `«${a.name}» знято з розкладу.`);
  };

  const roles = useMemo(() => new Set(teamRoles(team.key, data?.accounts || [])), [team.key, data]); // the agents of this team (the operation also keeps the switched-off agents of other modes)
  const ready = useMemo(() => (data ? teamReadiness(team.key, { settings: data.settings, assets: data.assets, accounts: data.accounts, project: data.project }) : null), [data, team.key]);
  const total = (Number(spent?.claude_usd) || 0) + (Number(spent?.higgsfield_usd) || 0);
  const capChanged = ctl && cap !== (ctl.spendCapUsd == null ? '' : String(ctl.spendCapUsd));
  const [label, tone] = STATE[state] || STATE.paused;

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="tc-title" tabIndex={-1}>
        <header className="tm-head">
          <h2 id="tc-title">{team.def.title} <span className={'pcr-state ' + tone}>{label}</span></h2>
          <button type="button" className="tm-x" onClick={onClose} aria-label="Закрити">×</button>
        </header>
        <div className="tm-body">
          <div className="tc-top">
            <p className="tm-lead">{team.def.text}</p>
            <button type="button" className={'btn' + (state === 'running' ? '' : ' btn-p')} disabled={!!busy} onClick={toggleTeam}>{state === 'running' ? 'Зупинити команду' : 'Продовжити команду'}</button>
          </div>
          {error && <p className="pcr-error" role="alert">{error}</p>}
          {!ctl && !error && <div className="pcr-empty">Завантаження…</div>}

          {ctl && (
            <section className="tc-sec" aria-label="Агенти команди">
              <h3>Агенти: коли працюють</h3>
              <ul className="tc-agents">
                {ctl.agents.filter((a) => roles.has(a.role)).map((a) => {
                  const d = drafts[a.id] || fromSchedule(a.schedule);
                  const own = a.trigger === 'schedule';
                  const dirty = own && !same(toSchedule(d), a.schedule ? (a.schedule.everyDays ? { everyDays: a.schedule.everyDays, time: a.schedule.time } : { weekday: a.schedule.weekday, time: a.schedule.time }) : null);
                  return (
                    <li key={a.id} className={'tc-agent' + (a.mode === 'paused' ? ' is-off' : '')}>
                      <div className="tc-agent-main">
                        <b>{a.name}</b>
                        <small>{shortOf(a.role)}</small>
                        <small>{a.mode === 'paused' ? 'на паузі' : a.nextAt ? `наступний запуск ${fmtDateTime(a.nextAt)} (Київ)` : own ? 'без розкладу, лише вручну' : a.trigger === 'initial' ? 'один раз, під час запуску' : 'після агентів, від яких залежить'}{a.lastRunAt ? ` · останній ${fmtDateTime(a.lastRunAt)}${a.lastStatus ? ` (${LAST[a.lastStatus] || a.lastStatus})` : ''}` : ''}</small>
                      </div>
                      <div className="tc-modes" role="group" aria-label={`Режим: ${a.name}`}>
                        {AGENT_MODES.map((m) => (
                          <button key={m.key} type="button" aria-pressed={a.mode === m.key} className={'btn' + (a.mode === m.key ? ' btn-p' : '')} disabled={!!busy || a.mode === m.key} onClick={() => run('mode' + a.id, () => setAgentMode(a.id, m.key), `«${a.name}»: ${m.label.toLowerCase()}.`)}>{m.label}</button>
                        ))}
                      </div>
                      {own && (
                        <span className="tm-sched tc-sched">
                          <select className="tm-sel" value={d.mode} onChange={(e) => patch(a.id, { mode: e.target.value })} aria-label={`Як часто: ${a.name}`}>
                            <option value="every">Кожні N днів</option><option value="week">Раз на тиждень</option><option value="manual">Без розкладу</option>
                          </select>
                          {d.mode === 'every' && <><input className="tm-num" type="number" min="1" max={MAX_EVERY_DAYS} value={d.every} onChange={(e) => patch(a.id, { every: e.target.value })} aria-label={`Кожні скільки днів: ${a.name}`} /><span>дн.</span></>}
                          {d.mode === 'week' && <select className="tm-sel" value={d.weekday} onChange={(e) => patch(a.id, { weekday: e.target.value })} aria-label={`День тижня: ${a.name}`}>{WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</select>}
                          {d.mode !== 'manual' && <input className="tm-time" type="text" inputMode="numeric" value={d.time} onChange={(e) => patch(a.id, { time: e.target.value })} placeholder="09:00" aria-label={`Час (Київ): ${a.name}`} />}
                          <button type="button" className="btn" disabled={!dirty || !!busy} onClick={() => saveSchedule(a)}>Зберегти розклад</button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="tm-hint">Новий розклад діє з наступного запуску й не наздоганяє пропущені. «З моїм підтвердженням»: агент працює, а далі чекає вашого «Передати».</p>
            </section>
          )}

          {ready && (
            <section className="tc-sec" aria-label="Що читають агенти">
              <h3>Що агенти читають із картки проєкту</h3>
              {!ready.required.length && !ready.recommended.length && <p className="tm-ok">Усе потрібне в картці заповнено.</p>}
              {[...ready.required.map((x) => ['required', x]), ...ready.recommended.map((x) => ['recommended', x])].length > 0 && (
                <ul className="tm-miss-list">
                  {[...ready.required.map((x) => ['required', x]), ...ready.recommended.map((x) => ['recommended', x])].map(([level, item]) => (
                    <li key={item.key} className={'tm-miss is-' + level}>
                      <div className="tm-miss-top">
                        <span className="tm-miss-name"><b>{item.label}</b><em>{level === 'required' ? 'обовʼязково' : 'бажано'}</em></span>
                        <small>потрібно: {item.agents.join(', ')}</small>
                        <button type="button" className="btn" onClick={() => onGoFill?.(item.where)}>Відкрити в картці</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="tm-hint">Зміни в картці зберігаються одразу й потрапляють до агентів з їхнього наступного запуску.</p>
            </section>
          )}

          {ctl && (
            <section className="tc-sec" aria-label="Вказівки менеджера">
              <h3>Вказівки менеджера</h3>
              {!ctl.instructions.length && <p className="tm-hint">Вказівок немає. Напишіть, на чому зосередитись, чого уникати: агенти прочитають це перед кожним запуском.</p>}
              {ctl.instructions.length > 0 && (
                <ul className="tc-instr">
                  {ctl.instructions.map((it, i) => (
                    <li key={it.at + i}>
                      <div><em>{it.role ? ctl.agents.find((a) => a.role === it.role)?.name || it.role : 'усі агенти'}</em><p>{it.text}</p><small>{it.by || '—'} · {fmtDateTime(it.at)}</small></div>
                      <button type="button" className="btn" disabled={!!busy} onClick={() => run('rm' + i, () => removeInstruction(campaign.id, it.at), 'Вказівку видалено.')}>Видалити</button>
                    </li>
                  ))}
                </ul>
              )}
              <textarea className="tm-area" rows={2} value={text} maxLength={MAX_INSTRUCTION_CHARS} onChange={(e) => setText(e.target.value)} placeholder="Наприклад: не згадувати знижки, акцент на преміальності." aria-label="Нова вказівка" />
              <div className="tm-miss-acts">
                <select className="tm-sel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Кому вказівка"><option value="">Для всіх агентів</option>{ctl.agents.filter((a) => roles.has(a.role)).map((a) => <option key={a.role} value={a.role}>{a.name}</option>)}</select>
                <button type="button" className="btn btn-p" disabled={text.trim().length < 3 || !!busy} onClick={() => run('add', async () => { await addInstruction(campaign.id, text, role || null); setText(''); }, 'Вказівку додано.')}>Додати вказівку</button>
              </div>
            </section>
          )}

          {ctl && (
            <section className="tc-sec" aria-label="Гроші">
              <h3>Гроші</h3>
              <p className="tc-money">Витрачено: <b>${total.toFixed(2)}</b>{ctl.spendCapUsd != null ? <> з ліміту <b>${Number(ctl.spendCapUsd).toFixed(2)}</b></> : ' (ліміту немає)'}</p>
              <div className="tm-miss-acts">
                <label className="tc-cap">Ліміт, $<input className="tm-num" type="text" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="без ліміту" aria-label="Ліміт операції, $" /></label>
                <button type="button" className="btn" disabled={!capChanged || !!busy} onClick={() => run('cap', () => saveCampaignMoney(campaign.id, { capUsd: cap }), 'Ліміт збережено.')}>Зберегти ліміт</button>
              </div>
              <p className="tm-hint">Досягши ліміту, команда не запускає нових платних кроків. Порожнє поле: без ліміту.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
