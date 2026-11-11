import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { kickQueue } from '../../../lib/api/agents';
import { fetchCampaignControl } from '../../../lib/api/campaignControl';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { createExtraCycle, removeRegular, runRegularNow, saveRegular, setRegularEnabled } from '../../../lib/api/operationCycles';
import { MAX_REGULARS, SECTIONS, buildOperationView, cycleCosts, describeCycle } from '../../../lib/agents/operationCycles';
import { directionLimit } from '../../../lib/agents/creativeTeam';
import CampaignSpend from '../../AgentSpend/CampaignSpend';
import CampaignControl from '../campaigns/CampaignControl';
import CampaignPage from '../campaigns/CampaignPage';
import Deliverables from '../campaigns/Deliverables';
import RequestForm from '../campaigns/studio/RequestForm';
import AgentsSettings from './AgentsSettings';
import AttentionRow from './AttentionRow';
import Gallery from './Gallery';
import { StageLine } from './ProjectWindow';
import { IconBadge, Ic, Progress, Spinner } from './parts';
import { fmtAgo, fmtDay, fmtUsd, plural } from './format';
import '../../../styles/studio.css';
import './ProjectCard.css';

const REQ_CHIP = { draft: 'is-grey', running: 'is-work', review: 'is-warn', problem: 'is-bad', approved: 'is-ok' };
const STATE_CHIP = { review: 'is-warn', rework: 'is-back', checked: 'is-ok' };
const PASS_STATUS = { ok: 'успішно', failed: 'помилка', running: 'працює' };
const fmtWhen = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} о ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const countsLine = (c = {}) => [c.review ? `на перегляд: ${c.review}` : '', c.approved ? `затверджено: ${c.approved}` : '', c.rejected ? `повернено: ${c.rejected}` : '', c.producing ? `генерується: ${c.producing}` : ''].filter(Boolean).join(' · ') || 'рішень ще немає';

// One cycle that is in work: what it makes, how far it is, the step of the chain, what comes after it.
function CycleCard({ cycle, busy, onStart, onGo }) {
  const s = cycle.stage;
  const pct = Math.round((cycle.progress || 0) * 100);
  return (
    <section className={'ckp-box opv-cycle' + (s.blocked === 'failed' ? ' is-bad' : s.blocked === 'estimate' || s.blocked === 'review' ? ' is-warn' : '')} aria-label={`Завдання ${cycle.id}`}>
      <div className="ckp-sec-h">
        <h3>Завдання №{cycle.id}</h3>
        <span className={'ckp-chip ' + (cycle.kind === 'regular' ? 'is-work' : '')}>{cycle.kindLabel}</span>
        <span className={'ckp-chip ' + (REQ_CHIP[cycle.status] || '')}>{cycle.statusLabel}</span>
        <span className="opv-date">оновлено {fmtAgo(cycle.updatedAt) || '—'}</span>
      </div>
      <p className="opv-what">{cycle.text}</p>
      <div className="opv-prog"><Progress value={cycle.progress} /><em>{pct}%</em></div>
      {cycle.status !== 'draft' && <StageLine stages={cycle.stages} currentKey={cycle.currentStageKey} />}
      <dl className="opv-steps">
        <div><dt>Зараз</dt><dd>{s.now}</dd></div>
        {s.next && <div><dt>Далі</dt><dd>{s.next}</dd></div>}
      </dl>
      {cycle.error && cycle.status === 'problem' && <p className="ckp-err" role="status">{cycle.error}</p>}
      <div className="ckp-acts">
        {(cycle.status === 'draft' || (cycle.status === 'problem' && !cycle.stages.some((x) => x.state === 'failed'))) && (
          <button type="button" className="ckp-btn is-primary" disabled={!!busy} onClick={() => onStart(cycle)}>{busy === 'start' + cycle.id ? <Spinner /> : <Ic n="play" size={15} />}{cycle.status === 'draft' ? 'Запустити завдання' : 'Запустити ще раз'}</button>
        )}
        {(s.blocked === 'failed' || s.blocked === 'estimate') && <button type="button" className="ckp-btn is-primary" onClick={() => onGo('messages')}>Перейти до повідомлень<Ic n="arrow" size={15} /></button>}
        {s.blocked === 'review' && <button type="button" className="ckp-btn is-primary" onClick={() => onGo('review', cycle.id)}>Перейти до перевірки<Ic n="arrow" size={15} /></button>}
      </div>
    </section>
  );
}

// An operation without the creative department works by the schedules of its own agents: when each one worked last and when the agents run next.
function Passes({ campaignId }) {
  const [ctl, setCtl] = useState(null);
  useEffect(() => { let off = false; fetchCampaignControl(campaignId).then((d) => { if (!off) setCtl(d); }).catch(() => { if (!off) setCtl({ agents: [] }); }); return () => { off = true; }; }, [campaignId]);
  if (!ctl) return <div className="ckp-skel ckp-skel-wide" aria-hidden="true" />;
  const working = ctl.agents.filter((a) => a.mode !== 'paused' && (a.schedule || a.lastRunAt));
  const last = working.filter((a) => a.lastRunAt).sort((x, y) => String(y.lastRunAt).localeCompare(String(x.lastRunAt)))[0] || null;
  const next = working.filter((a) => a.nextAt).sort((x, y) => String(x.nextAt).localeCompare(String(y.nextAt)))[0] || null;
  return (
    <section className="ckp-box opv-cycle" aria-label="Робота агентів операції">
      <div className="ckp-sec-h"><h3>Агенти за розкладом</h3>{last && <span className="ckp-chip">{PASS_STATUS[last.lastStatus] || last.lastStatus || '—'}</span>}</div>
      <p className="opv-what">{last ? 'Кожен агент працює за своїм розкладом і передає результат наступному.' : 'Агенти ще не запускались: перший запуск буде за їхнім розкладом.'}</p>
      <dl className="opv-steps">
        {last && <div><dt>Останній запуск</dt><dd>{last.name}: {fmtWhen(last.lastRunAt)}</dd></div>}
        <div><dt>Наступний запуск</dt><dd>{next ? `${next.name}: ${fmtWhen(next.nextAt)}` : 'за розкладом агентів немає запланованих запусків'}</dd></div>
      </dl>
    </section>
  );
}

// The card of ONE operation inside the card of a project (owner, 2026-11-11), six sections:
//   «Зараз в роботі»            the cycles that are in work (regular or extra): what, how far, the step, what is next, when the regular one starts again
//   «Потребує перевірки»        a card per cycle with ready creatives: approve / return, the archive of the approved ones, download at any time
//   «Повідомлення від агентів»  everything the agents need from the person: a stopped step, a question, the price of the pictures to confirm
//   «Витрати»                   the money of the operation, by cycle and by period
//   «Налаштування»              the regular cycle (day, time, formats, how many, texts), the cap, the instructions, the agents
//   «Готові матеріали»          the approved materials of the last cycle
//   campaign: the ag_campaigns row  cockpit: the cabinet of the operation  run(item, key, payload): the action of the cabinet (useProjectCockpit)
//   regularFirst: the operation was just created → the form of the regular cycle opens at once
export default function OperationView({ campaign, cockpit: c, project, loading = false, run, notify, onChanged, onBack, onOpenAgents, regularFirst = false, extraFirst = false }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [section, setSection] = useState('now');
  // the form of a cycle: { mode: 'extra', allowKind } (a new one, the kind is chosen in the form) | { mode: 'regular', regularId? } (a regular one: new or edited)
  const [form, setForm] = useState(regularFirst ? { mode: 'regular' } : extraFirst ? { mode: 'extra', allowKind: false } : null);
  const [openCycle, setOpenCycle] = useState(null);
  const [busy, setBusy] = useState('');
  const [rework, setRework] = useState(null); // { requestId, usd, count, skipped }
  const [fullPage, setFullPage] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false); // the card of an operation that stands alone has no «Налаштування агентів» tab: the agents open here
  const view = useMemo(() => buildOperationView({ campaign, cockpit: c }), [campaign, c]);
  const costs = useMemo(() => cycleCosts(c), [c]);
  const stopped = ['paused', 'archived'].includes(campaign.status);
  const act = useCallback((item, key, payload = {}) => run(item, key, { campaignId: campaign.id, ...payload }), [run, campaign.id]);
  const [reviewTab, setReviewTab] = useState('now'); // now (the cycles that wait for the person) | archive (the checked ones)
  const go = (key, cycleId = null) => {
    setSection(key); setOpenCycle(cycleId); setRework(null);
    if (key === 'review') setReviewTab(cycleId != null && view.review.some((r) => r.id === cycleId && !r.pending) ? 'archive' : 'now');
  };

  async function guard(id, fn, okText) {
    setBusy(id);
    try { await fn(); if (okText) notify?.(okText); await onChanged?.(); } catch (e) { notify?.(e?.message || 'Не вдалося виконати дію.', true); } finally { setBusy(''); }
  }
  const startCycle = (cycle) => guard('start' + cycle.id, () => act(null, 'start_cycle', { requestId: cycle.id }), 'Завдання запущено: агенти працюють.');

  // the form: a regular cycle is kept in the operation (the form sends its day and time), a one-off one becomes a request and starts
  async function saveForm(values, start, schedule) {
    if (schedule) {
      const { campaign: saved, regular } = await saveRegular(campaign.id, { id: form.regularId, enabled: true, ...schedule, brief: values }, email);
      if (start) { await runRegularNow(saved, regular, email); kickQueue().catch(() => {}); }
      notify?.(start ? 'Регулярне завдання збережено, перше завдання запущено.' : 'Регулярне завдання збережено.');
    } else {
      await createExtraCycle(campaign.id, values, email, start);
      if (start) kickQueue().catch(() => {});
      notify?.(start ? 'Завдання запущено: агенти працюють.' : 'Завдання збережено як чернетку.');
    }
    setForm(null); setSection('now');
    await onChanged?.();
  }
  const editing = form?.regularId ? view.regulars.find((r) => r.id === form.regularId) || null : null;
  async function dropRegular(r) {
    if (!(await confirm({ title: 'Видалити регулярне завдання?', body: `«${r.title}» більше не запускатиметься сам. Завдання, які він уже зробив, залишаються.`, confirmLabel: 'Видалити', danger: true }))) return;
    await guard('rm' + r.id, () => removeRegular(campaign.id, r.id), 'Регулярне завдання видалено.');
  }

  // «Потребує перевірки»: the cycle that waits for the person is open at once; the checked cycles are kept in the tab «Архів завдань»
  const pending = view.review.filter((r) => r.pending);
  const archived = view.review.filter((r) => !r.pending);
  const cycle = reviewTab === 'now' ? pending.find((r) => r.id === openCycle) || pending[0] || null : archived.find((r) => r.id === openCycle) || null;
  const returned = cycle ? cycle.items.filter((i) => i.status === 'rejected') : [];
  async function estimateRework() {
    setBusy('rw');
    try { const res = await act(null, 'rework_estimate', { requestId: cycle.id, creativeIds: returned.map((i) => i.id) }); setRework({ requestId: cycle.id, ...res.rework }); } catch (e) { notify?.(e?.message || 'Не вдалося оцінити вартість.', true); } finally { setBusy(''); }
  }
  async function confirmRework() {
    setBusy('rw');
    try { const res = await act(null, 'rework_confirm', { requestId: cycle.id, creativeIds: returned.map((i) => i.id) }); setRework(null); notify?.(`Запущено картинок: ${res.submitted}. Нові версії зʼявляться тут за кілька хвилин.`); } catch (e) { notify?.(e?.message || 'Не вдалося запустити генерацію.', true); } finally { setBusy(''); }
  }
  const download = (requestId = null) => guard('dl' + (requestId ?? 'all'), async () => { const r = await act(null, 'download_approved', requestId != null ? { requestId } : {}); notify?.(`Завантажено файлів: ${r.downloaded}.`); });

  const badge = { now: view.counts.now, review: view.counts.review, messages: view.counts.messages };
  return (
    <div className="opv">
      <nav className="opv-line" role="tablist" aria-label="Розділи операції">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={section === k} className={section === k ? 'is-on' : ''} onClick={() => go(k)}>
            {label}{badge[k] > 0 ? <em className={k === 'now' ? '' : k === 'messages' && view.counts.problems ? 'is-bad' : 'is-warn'}>{badge[k]}</em> : null}
          </button>
        ))}
      </nav>

      {section === 'now' && (
        <>
          {view.creative && (
            <div className="opv-nowhead">
              <span>{view.inWork.length ? `Завдань у роботі: ${view.inWork.length}` : 'Зараз немає завдань у роботі'}</span>
              <button type="button" className="ckp-btn is-primary" onClick={() => setForm({ mode: 'extra', allowKind: true })}><Ic n="plus" size={16} />Створити додаткове завдання</button>
            </div>
          )}
          {!view.creative && <Passes campaignId={campaign.id} />}
          {view.creative && (
            <div className="opv-cycles">
              {!view.inWork.length && (
                <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Зараз нічого не в роботі</b><p>{view.counts.review ? `На вашу перевірку чекає креативів: ${view.counts.review}. ` : ''}{view.nextText}</p></div></div>
              )}
              {view.inWork.map((x) => <CycleCard key={x.id} cycle={x} busy={busy} onStart={startCycle} onGo={go} />)}
            </div>
          )}
        </>
      )}

      {section === 'review' && view.creative && (
        <>
          <div className="ckp-ribbon opv-subtabs" role="tablist" aria-label="Завдання на перевірку">
            <button type="button" role="tab" aria-selected={reviewTab === 'now'} className={reviewTab === 'now' ? 'is-on' : ''} onClick={() => { setReviewTab('now'); setOpenCycle(null); setRework(null); }}>{pending.length > 1 ? 'Актуальні завдання' : 'Актуальне завдання'}<em className={pending.length ? 'is-warn' : ''}>{pending.length}</em></button>
            <button type="button" role="tab" aria-selected={reviewTab === 'archive'} className={reviewTab === 'archive' ? 'is-on' : ''} onClick={() => { setReviewTab('archive'); setOpenCycle(null); setRework(null); }}>Архів завдань<em>{archived.length}</em></button>
          </div>

          {reviewTab === 'now' && !cycle && (
            <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Немає завдань на перевірку</b><p>{archived.length ? 'Усі готові креативи перевірено: завдання лежать в архіві, їх можна відкрити й завантажити будь-коли.' : 'Готових креативів ще немає. Завдання зʼявиться тут, щойно агенти зроблять перші картинки.'}</p></div>{archived.length > 0 && <button type="button" className="ckp-btn" style={{ marginLeft: 'auto' }} onClick={() => setReviewTab('archive')}>Архів завдань<Ic n="arrow" size={15} /></button>}</div>
          )}
          {/* the cycles that wait for the person: one card per cycle says everything once (its kind, what it is, how many wait); with several, a click switches */}
          {reviewTab === 'now' && pending.length > 0 && (
            <div className="opv-rvs" role={pending.length > 1 ? 'tablist' : undefined} aria-label="Актуальні завдання">
              {pending.map((r) => {
                const on = cycle?.id === r.id;
                const body = (
                  <>
                    <span className="opv-cyc-kind">{r.kindLabel} · №{r.id}</span>
                    <b>{r.title}</b>
                    <small>{[`на перевірці: ${r.creatives.review}`, r.creatives.approved ? `затверджено: ${r.creatives.approved}` : '', r.creatives.rejected ? `повернено: ${r.creatives.rejected}` : '', r.creatives.producing ? `переробляється: ${r.creatives.producing}` : ''].filter(Boolean).join(' · ')}</small>
                  </>
                );
                return pending.length > 1
                  ? <button key={r.id} type="button" role="tab" aria-selected={on} className={'opv-cyc' + (on ? ' is-on' : '')} onClick={() => { setOpenCycle(r.id); setRework(null); }}>{body}</button>
                  : <div key={r.id} className="opv-cyc is-on is-single">{body}</div>;
              })}
            </div>
          )}

          {reviewTab === 'archive' && !cycle && (
            <>
              <div className="ckp-sec-h">
                <h3>Архів завдань</h3><span className="ckp-chip">{archived.length}</span>
                <button type="button" className="ckp-btn" style={{ marginLeft: 'auto' }} disabled={!view.archive.count || !!busy} onClick={() => download()}>{busy === 'dlall' ? <Spinner /> : <Ic n="download" size={15} />}Завантажити затверджені з усіх завдань ({view.archive.count})</button>
              </div>
              {!archived.length && <p className="ckp-empty-line">Архів порожній. Завдання переходить сюди, коли ви ухвалили рішення щодо всіх його креативів; його можна відкрити й завантажити будь-коли.</p>}
              <div className="opv-arcs">
                {archived.map((r) => (
                  <button key={r.id} type="button" className="opv-arc" onClick={() => { setOpenCycle(r.id); setRework(null); }}>
                    <span className="opv-arc-pic" style={r.items.find((i) => i.url) ? { backgroundImage: `url(${r.items.find((i) => i.url).url})` } : undefined} aria-hidden="true" />
                    <span className="opv-arc-tx">
                      <b>Завдання №{r.id} · {r.title}</b>
                      <small>{[r.kindLabel, countsLine(r.creatives)].join(' · ')}</small>
                      <span className="opv-arc-foot"><span className={'ckp-chip ' + STATE_CHIP[r.state]}>{r.stateLabel}</span><span className="pcd-op-date">{fmtDay(r.updatedAt) || '—'}</span></span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {cycle && (
            <>
              {reviewTab === 'archive' ? (
                <div className="pcd-opbar">
                  <button type="button" className="ckp-btn" onClick={() => { setOpenCycle(null); setRework(null); }}><Ic n="back" size={15} />Архів завдань</button>
                  <b>{cycle.kindLabel} · №{cycle.id} · {cycle.title}</b>
                  <span className={'ckp-chip ' + STATE_CHIP[cycle.state]}>{cycle.stateLabel}</span>
                  <span className="pcd-opbar-sp" />
                  {returned.length > 0 && !rework && <button type="button" className="ckp-btn" disabled={!!busy} onClick={estimateRework}>{busy === 'rw' ? <Spinner /> : <Ic n="refresh" size={15} />}Переробити повернені ({returned.length})</button>}
                  <button type="button" className="ckp-btn is-primary" disabled={!cycle.creatives.approved || !!busy} onClick={() => download(cycle.id)}>{busy === 'dl' + cycle.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити затверджені ({cycle.creatives.approved})</button>
                </div>
              ) : (
                <div className="opv-rowhead">
                  <span>Схваліть або поверніть кожен креатив. Повернені можна переробити з вашим коментарем.</span>
                  {returned.length > 0 && !rework && <button type="button" className="ckp-btn" disabled={!!busy} onClick={estimateRework}>{busy === 'rw' ? <Spinner /> : <Ic n="refresh" size={15} />}Переробити повернені ({returned.length})</button>}
                  {cycle.creatives.review > 0 && <button type="button" className="ckp-btn is-ok" disabled={!!busy} onClick={() => guard('apall', () => act(null, 'approve_all', { requestId: cycle.id, creativeIds: cycle.items.filter((x) => x.status === 'review').map((x) => x.id) }))}>{busy === 'apall' ? <Spinner /> : <Ic n="check" size={15} />}Схвалити всі на перегляді ({cycle.creatives.review})</button>}
                </div>
              )}
              {rework && rework.requestId === cycle.id && (
                <div className="ckp-box opv-rework" role="status">
                  <p className="opv-what">Повернені картинки будуть зроблені заново з вашим коментарем. Оцінка Higgsfield: <b>{fmtUsd(rework.usd)}</b> за {rework.count} {plural(rework.count, 'картинку', 'картинки', 'картинок')}{rework.skipped ? `; ще ${rework.skipped} не вміщаються в ліміт запиту` : ''}.</p>
                  <div className="ckp-acts">
                    <button type="button" className="ckp-btn is-money" disabled={!!busy || !rework.count} onClick={confirmRework}>{busy === 'rw' && <Spinner />}Підтвердити переробку · {fmtUsd(rework.usd)}</button>
                    <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => setRework(null)}>Скасувати</button>
                  </div>
                </div>
              )}
              <section className="ckp-gzone" aria-label={`Креативи завдання ${cycle.id}`}>
                <Gallery key={cycle.id} minimal items={cycle.items} onAct={(key, payload = {}) => act(null, key, { requestId: cycle.id, ...payload })} loadingHint={loading} />
              </section>
            </>
          )}
        </>
      )}
      {section === 'review' && !view.creative && <div className="cmp-section pcd-embed"><Deliverables campaignId={campaign.id} notify={notify} /></div>}

      {section === 'messages' && (
        <section className="ckp-att" aria-label="Повідомлення від агентів">
          <div className="ckp-sec-h">
            <h3>Повідомлення від агентів</h3>
            {view.messages.length > 0 ? <span className="ckp-chip is-warn"><Ic n="clock" size={13} />{view.messages.length}</span> : <span className="ckp-chip is-ok"><Ic n="check" size={13} />нічого</span>}
            {view.counts.problems > 0 && <span className="ckp-chip is-bad"><Ic n="warn" size={13} />{view.counts.problems} {plural(view.counts.problems, 'помилка', 'помилки', 'помилок')}</span>}
          </div>
          {!view.messages.length && <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Усе гаразд</b><p>Агентам нічого від вас не потрібно. Тут зʼявляться зупинені кроки, питання агентів і оцінка вартості картинок на підтвердження.</p></div></div>}
          <div className="ckp-alist">
            {view.messages.map((a) => <AttentionRow key={a.id} item={a} onAction={act} />)}
          </div>
        </section>
      )}

      {section === 'spend' && (
        <>
          {view.creative && (
            <section className="ckp-box" aria-label="Витрати за завданнями">
              <div className="ckp-sec-h"><h3>Витрати за завданнями</h3><span className="ckp-chip">{fmtUsd(c?.spend?.total)} за весь час</span></div>
              {!costs.length && <p className="ckp-empty-line">Завдань ще не було.</p>}
              {costs.length > 0 && (
                <div className="opv-sp">
                  {costs.map((r) => {
                    const sum = (r.model || 0) + (r.higgsfield || 0);
                    return (
                      <article key={r.id} className="opv-spc" aria-label={`Завдання ${r.id}`}>
                        <b>Завдання №{r.id} · {r.title}</b>
                        <small>{r.kindLabel} · картинок: {r.pictures}</small>
                        <span className="opv-spc-big">{fmtUsd(r.total)}</span>
                        <span className="opv-spc-bar" aria-hidden="true"><i style={{ width: sum ? `${((r.model || 0) / sum) * 100}%` : '0%', background: '#EB9CEF' }} /><i style={{ width: sum ? `${((r.higgsfield || 0) / sum) * 100}%` : '0%', background: '#7C8CF8' }} /></span>
                        <span className="ckp-leg"><span><i style={{ background: '#EB9CEF' }} />Claude <b>{fmtUsd(r.model)}</b></span><span><i style={{ background: '#7C8CF8' }} />Higgsfield <b>{fmtUsd(r.higgsfield)}</b></span></span>
                      </article>
                    );
                  })}
                </div>
              )}
              <p className="ckp-empty-line">Claude за завданням рахується за останні 30 днів; повна сума операції — у блоці нижче.</p>
            </section>
          )}
          <div className="pcd-embed pcd-spend"><CampaignSpend campaignId={campaign.id} /></div>
        </>
      )}

      {section === 'settings' && (
        <>
          {view.creative && (
            <section className="ckp-box opv-regular" aria-label="Регулярні завдання">
              <div className="ckp-sec-h">
                <h3>Регулярні завдання</h3><span className="ckp-chip">{view.regulars.length}</span>
                <button type="button" className="ckp-btn is-primary" style={{ marginLeft: 'auto' }} disabled={view.regulars.length >= MAX_REGULARS} onClick={() => setForm({ mode: 'regular' })}><Ic n="plus" size={15} />Додати регулярне завдання</button>
              </div>
              <p className="opv-what">Регулярне завдання запускається щотижня у свій день і час, з однаковими параметрами. Їх може бути кілька. Зміни діють з наступного запуску.</p>
              {!view.regulars.length && <p className="ckp-empty-line">Регулярних завдань немає: операція працює лише коли ви створюєте завдання вручну.</p>}
              <div className="opv-regs">
                {view.regulars.map((r) => (
                  <article key={r.id} className={'opv-reg' + (r.enabled ? '' : ' is-off')} aria-label={r.title}>
                    <div className="ckp-sec-h"><b>{r.title}</b><span className={'ckp-chip ' + (r.enabled ? 'is-work' : 'is-grey')}>{r.enabled ? r.whenText : 'вимкнено'}</span></div>
                    <dl className="opv-list">
                      <div><dt>Що потрібно</dt><dd>{r.brief.goal}</dd></div>
                      <div><dt>Наступний запуск</dt><dd>{r.enabled ? (r.next ? `${r.next.text} (Київ)${stopped ? ': але операція на паузі' : ''}` : '—') : 'вимкнено'}</dd></div>
                      <div><dt>Формати і напрями</dt><dd>{r.brief.ratios.join(', ')} · напрямів: {directionLimit(r.brief)} (креативів на одне завдання: до {directionLimit(r.brief) * r.brief.ratios.length})</dd></div>
                      <div><dt>Тексти</dt><dd>{r.brief.texts === 'no' ? 'без тексту на картинці' : 'пише агент копірайтер'} · мова: {r.brief.language === 'en' ? 'English' : 'українська'}</dd></div>
                    </dl>
                    <div className="ckp-acts">
                      <button type="button" className="ckp-btn" onClick={() => setForm({ mode: 'regular', regularId: r.id })}><Ic n="pen" size={15} />Змінити</button>
                      <button type="button" className="ckp-btn" disabled={!!busy} onClick={() => guard('reg' + r.id, () => setRegularEnabled(campaign.id, r.id, !r.enabled, email), r.enabled ? 'Регулярне завдання вимкнено.' : 'Регулярне завдання увімкнено.')}><Ic n={r.enabled ? 'stop' : 'play'} size={15} />{r.enabled ? 'Вимкнути' : 'Увімкнути'}</button>
                      <button type="button" className="ckp-btn is-danger" disabled={!!busy} onClick={() => dropRegular(r)}>Видалити</button>
                    </div>
                  </article>
                ))}
              </div>
              {onOpenAgents && <div className="ckp-acts"><button type="button" className="ckp-btn" onClick={onOpenAgents}>Налаштування агентів</button></div>}
            </section>
          )}
          {campaign.status !== 'draft' && <div className="cmp-section pcd-embed"><CampaignControl campaign={campaign} notify={notify} /></div>}
          {!onOpenAgents && <button type="button" className="ckp-btn pcd-agents-more" aria-expanded={agentsOpen} onClick={() => setAgentsOpen((v) => !v)}><span className={agentsOpen ? 'ckp-flip' : ''}><Ic n="chev" size={14} /></span>Налаштування агентів операції</button>}
          {!onOpenAgents && agentsOpen && <AgentsSettings campaigns={[campaign]} currentId={campaign.id} notify={notify} onChanged={onChanged} />}
          <button type="button" className="ckp-btn pcd-agents-more" aria-expanded={fullPage} onClick={() => setFullPage((v) => !v)}><span className={fullPage ? 'ckp-flip' : ''}><Ic n="chev" size={14} /></span>Схема агентів, звіти, архів і видалення операції</button>
          {fullPage && <div className="cmp-section pcd-embed"><CampaignPage key={campaign.id} campaign={campaign} project={project} notify={notify} onBack={onBack} onChanged={onChanged} /></div>}
        </>
      )}

      {section === 'ready' && view.creative && (
        <section className="ckp-box" aria-label="Готові матеріали останнього завдання">
          <div className="ckp-sec-h">
            <h3>Готові матеріали останнього завдання</h3>
            {view.ready && <span className="ckp-chip">Завдання №{view.ready.cycle.id} · {view.ready.cycle.kindLabel}</span>}
            {view.ready && <button type="button" className="ckp-btn is-primary" style={{ marginLeft: 'auto' }} disabled={!view.ready.items.length || !!busy} onClick={() => download(view.ready.cycle.id)}>{busy === 'dl' + view.ready.cycle.id ? <Spinner /> : <Ic n="download" size={15} />}Завантажити (ZIP)</button>}
          </div>
          {!view.ready && <p className="ckp-empty-line">Готових матеріалів ще немає: вони зʼявляться після першого завдання.</p>}
          {view.ready && (
            <>
              <p className="opv-what">{view.ready.cycle.title}</p>
              {(view.ready.pending > 0 || view.ready.returned > 0) && (
                <p className="ckp-empty-line">{[view.ready.pending ? `ще на перевірці: ${view.ready.pending}` : '', view.ready.returned ? `повернено на доопрацювання: ${view.ready.returned}` : ''].filter(Boolean).join(' · ')}. <button type="button" className="ckp-more" onClick={() => go('review', view.ready.cycle.id)}>Перейти до перевірки</button></p>
              )}
              {!view.ready.items.length && <p className="ckp-empty-line">У цьому завданні ще нічого не затверджено.</p>}
              <div className="opv-ready">
                {view.ready.items.map((i) => (
                  <article key={i.id} className="opv-mat">
                    <span className="opv-mat-pic" style={{ backgroundImage: `url(${i.url})` }} role="img" aria-label={i.conceptName} />
                    <div className="opv-mat-tx">
                      <b>{i.conceptName}</b>
                      <small>{i.ratio || '4:5'} · {i.fileName}</small>
                      {i.copy?.headline && <p><em>Заголовок:</em> {i.copy.headline}</p>}
                      {i.copy?.text && <p><em>Текст:</em> {i.copy.text}</p>}
                      {i.copy?.description && <p><em>Опис:</em> {i.copy.description}</p>}
                      {i.copy?.cta && <p><em>Кнопка:</em> {i.copy.cta}</p>}
                      <button type="button" className="ckp-btn is-sm" disabled={!!busy} onClick={() => guard('one' + i.id, () => act(null, 'download_one', { creativeId: i.id }))}><Ic n="download" size={14} />Завантажити</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {section === 'ready' && !view.creative && <div className="cmp-section pcd-embed"><Deliverables campaignId={campaign.id} notify={notify} /></div>}

      {form && (
        <div className="cmp-section pcd-embed">
          <RequestForm key={form.regularId || form.mode} campaign={campaign} mode={form.mode} allowKind={!!form.allowKind} title="Разове завдання: запит на креативи" initial={editing ? { ...editing.brief, materials: [] } : null}
            schedule={editing ? { weekday: editing.weekday, everyDays: editing.everyDays, time: editing.time } : null} canStartNow={!stopped} onClose={() => setForm(null)} onSave={saveForm} />
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
