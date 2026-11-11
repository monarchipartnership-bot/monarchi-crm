import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useConfirm } from '../../../components/common/ConfirmDialog';
import { supabase } from '../../../lib/supabaseClient';
import { updateCampaign } from '../../../lib/api/campaigns';
import { kickQueue } from '../../../lib/api/agents';
import { renameAiProject } from '../../../lib/api/aiProjects';
import { PLATFORM_LABEL, TITLE_MAX, groupOperations, projectHeadline } from '../../../lib/agents/aiProjects';
import { buildOperationView } from '../../../lib/agents/operationCycles';
import { modeLabelOf } from '../../../lib/agents/projectCockpit';
import CampaignPage from '../campaigns/CampaignPage';
import CreateCampaignWizard from '../campaigns/CreateCampaignWizard';
import CampaignSpend from '../../AgentSpend/CampaignSpend';
import ProjectCreativeTab from '../../../components/Projects/Creative/ProjectCreativeTab';
import AgentsSettings from './AgentsSettings';
import AttentionRow from './AttentionRow';
import NameEdit from './NameEdit';
import OperationView from './OperationView';
import { ProgressRing, StageRoute } from './StageRoute';
import { Avatar, Ic, Progress, WaitChip } from './parts';
import { fmtAgo, fmtDay, fmtUsd, plural } from './format';
import '../../../styles/aiAgentsSection.css';
import '../../../styles/agentAnalyticsPage.css';
import '../../../styles/agentSpendPage.css';
import '../../../styles/campaignsSection.css';
import './cockpit.css';
import './ProjectCard.css';

const TABS = [['overview', 'Загальна інформація', 'home'], ['operations', 'Операції', 'strategy'], ['agents', 'Налаштування агентів', 'bot'], ['spend', 'Витрати', 'wallet'], ['info', 'Готовність до роботи', 'info']];
const OP_STATUS = { active: ['працює', 'is-work'], paused: ['на паузі', ''], draft: ['не запущена', 'is-grey'], archived: ['завершена', 'is-ok'] };

// an operation of the project, as a card with a colour bar of its state (red: a step failed, amber: waits for you, ok: finished, violet: works, grey: the rest)
function OpRow({ op, onOpen }) {
  const [label, tone] = OP_STATUS[op.status] || [op.status, ''];
  const state = op.tone === 'problem' ? 'bad' : op.waiting > 0 ? 'warn' : op.status === 'archived' ? 'ok' : op.status === 'active' ? 'work' : 'idle';
  return (
    <button type="button" className={'pcd-opc is-' + state} onClick={() => onOpen(op.id)} aria-label={`${op.name}: ${op.modeLabel}`}>
      {/* the operation's own name on top, then in the order of what matters most (owner, 2026-11-11): its kind, its state, the open cycles, how far, what waits, when updated */}
      <span className="pcd-opc-top"><b>{op.name}</b><span className={'ckp-chip ' + tone}>{label}</span></span>
      <span className="pcd-opc-type"><i>Тип</i>{op.modeLabel}</span>
      {op.cycles.length > 0
        ? <span className="pcd-opc-cycles">{op.cycles.map((c) => <span key={c.id} title={c.title}>{c.kindLabel} №{c.id}</span>)}</span>
        : ['active', 'paused'].includes(op.status) ? <span className="pcd-opc-cycles is-none"><span>Зараз немає завдань у роботі</span></span> : null}
      {op.cycles.length > 0 && <span className="pcd-op-prog"><Progress value={op.cycleProgress} /><em>{Math.round((op.cycleProgress || 0) * 100)}%</em></span>}
      {op.waiting > 0 && <span className="pcd-opc-chips"><WaitChip tone={op.tone} waiting={op.waiting} /></span>}
      <span className="pcd-opc-foot"><span className="pcd-op-date">{op.status === 'archived' ? `завершено ${fmtDay(op.updatedAt) || '—'}` : `оновлено ${fmtAgo(op.updatedAt) || '—'}`}</span><Ic n="arrow" size={15} /></span>
    </button>
  );
}

// The card of a project of the AI Agents section, on the whole screen (owner, 2026-11-11): the head (name, state, what a person does with the project) and four
// sections: the overview (the current operation, the money, what waits), the operations (each opens right here), the money, and what is known about the client.
//   row: the project row (lib/agents/aiProjects)  cockpit: useProjectCockpit()  initialOperationId: open this operation at once
//   onFinish / onRemove / onRestore(row) → Promise (the page asks and does it)  ready: the table of the projects is connected  onChanged(): something changed
export default function ProjectCard({ row, cockpit, initialOperationId = null, ready = true, onClose, onFinish, onRemove, onRestore, onChanged }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [confirm, confirmDialog] = useConfirm();
  const [tab, setTab] = useState(initialOperationId != null ? 'operations' : 'overview');
  const [openOp, setOpenOp] = useState(initialOperationId);
  const openOpRef = useRef(openOp); openOpRef.current = openOp;
  const [regularFirst, setRegularFirst] = useState(false); // the operation was just created: the form of its regular cycle opens at once
  const [campaigns, setCampaigns] = useState(null);
  const [project, setProject] = useState(null);
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState('');
  const [rename, setRename] = useState(null); // the text of the project's own name while it is edited (null: not edited)
  const renameRef = useRef(rename); renameRef.current = rename;
  const [toast, setToast] = useState(null);
  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4500); }, []);
  // Escape closes what is on top: a dialog opened from the card closes itself; then the opened operation, then the card
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1 || document.querySelector('.ui-select-menu:not(.closing)')) return;
      if (document.querySelector('[data-name-edit]')) return; // the name of an operation is being edited: its field takes Escape
      if (renameRef.current != null) { setRename(null); return; }
      if (openOpRef.current != null) setOpenOp(null); else onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const load = useCallback(async () => {
    const [c, p, a] = await Promise.all([
      supabase.from('ag_campaigns').select('*').eq('project_id', row.id).order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, client, client_id').eq('id', row.id).maybeSingle(),
      supabase.from('project_ad_accounts').select('project_id, platform, account_id, account_name, account_status').eq('project_id', row.id),
    ]);
    if (c.error) throw c.error;
    setCampaigns(c.data || []);
    setProject({ ...(p.data || { id: row.id, name: row.name, client: row.client }), accounts: a.data || [] });
  }, [row.id, row.name, row.client]);
  useEffect(() => { load().catch((e) => notify(e.message || 'Не вдалося завантажити проєкт.', true)); }, [load, notify]);
  const changed = useCallback(async () => { await Promise.all([load(), cockpit.reload?.()]); onChanged?.(); }, [load, cockpit, onChanged]);

  const groups = useMemo(() => groupOperations(campaigns || [], cockpit.byId, cockpit.list), [campaigns, cockpit.byId, cockpit.list]);
  const head = useMemo(() => projectHeadline(row, campaigns || []), [row, campaigns]);
  const current = groups.current[0] || null;
  const currentCockpit = current ? cockpit.byId[current.id] || null : null;
  // the overview says in words what the current operation does: the cycle that is in work (or waits for the person's check), its step and what comes next
  const curRow = current ? (campaigns || []).find((c) => c.id === current.id) || null : null;
  const curView = useMemo(() => (curRow ? buildOperationView({ campaign: curRow, cockpit: currentCockpit }) : null), [curRow, currentCockpit]);
  const focus = curView ? curView.inWork.find((c) => c.status !== 'draft') || curView.review.find((r) => r.pending) || null : null;
  const waitingCycles = curView ? curView.review.filter((r) => r.pending) : [];
  const focusNow = !focus ? null : focus.stage
    ? { now: focus.stage.now, next: focus.stage.next, progress: focus.progress }
    : { now: `Готові креативи чекають вашої перевірки: ${curView.counts.review}`, next: 'Схваліть або поверніть їх в операції, розділ «Потребує перевірки»', progress: 1 };
  // the colour of the «now» panel and of the ring: red when a step of the cycle failed, amber when the cycle waits for the person, otherwise the accent
  const focusTone = !focus ? '' : focus.stage?.blocked === 'failed' ? 'bad' : !focus.stage || ['estimate', 'review'].includes(focus.stage.blocked) ? 'warn' : '';
  const attention = useMemo(() => groups.current.flatMap((o) => (cockpit.byId[o.id]?.attention || []).map((a) => ({ ...a, _op: o }))).sort((x, y) => (y.tone === 'problem') - (x.tone === 'problem')), [groups, cockpit.byId]);
  const problems = attention.filter((a) => a.tone === 'problem').length;
  const spend = useMemo(() => {
    const list = (campaigns || []).map((c) => cockpit.byId[c.id]?.spend).filter(Boolean);
    return { model: list.reduce((s, x) => s + (x.model || 0), 0), higgsfield: list.reduce((s, x) => s + (x.higgsfield || 0), 0), total: list.reduce((s, x) => s + (x.total || 0), 0) };
  }, [campaigns, cockpit.byId]);
  const done = row.status === 'done';
  const activeIds = (campaigns || []).filter((c) => c.status === 'active').map((c) => c.id);
  const pausedIds = (campaigns || []).filter((c) => c.status === 'paused').map((c) => c.id);

  const openOperation = (id) => { setTab('operations'); setOpenOp(id); setRegularFirst(false); };
  const opRow = openOp != null ? (campaigns || []).find((c) => c.id === openOp) || null : null;
  const opCockpit = openOp != null ? cockpit.byId[openOp] || null : null;

  async function stopAll() {
    const resume = !activeIds.length && pausedIds.length > 0;
    const ids = resume ? pausedIds : activeIds;
    if (!ids.length) return;
    if (!(await confirm(resume
      ? { title: 'Відновити всі операції проєкту?', body: `Операцій на паузі: ${ids.length}. Їхні агенти знову працюватимуть за розкладом і витрачатимуть кошти.`, confirmLabel: 'Відновити' }
      : { title: 'Зупинити всі операції проєкту?', body: `Активних операцій: ${ids.length}. Агенти перестануть запускатися, поки ви не відновите операції. Нічого не видаляється.`, confirmLabel: 'Зупинити' }))) return;
    setBusy('stop');
    try {
      for (const id of ids) await updateCampaign(id, { status: resume ? 'active' : 'paused' });
      if (resume) kickQueue().catch(() => {});
      notify(resume ? 'Операції відновлено.' : 'Усі операції проєкту зупинено.');
      await changed();
    } catch (e) { notify(e.message || 'Не вдалося змінити операції.', true); } finally { setBusy(''); }
  }
  async function toggleOp(c) {
    setBusy('op');
    try { await updateCampaign(c.id, { status: c.status === 'paused' ? 'active' : 'paused' }); if (c.status === 'paused') kickQueue().catch(() => {}); await changed(); } catch (e) { notify(e.message || 'Не вдалося змінити операцію.', true); } finally { setBusy(''); }
  }
  const act = async (fn) => { const ok = await fn?.(row); if (ok !== false) onClose?.(); };
  // the person's own name of the project (empty = the name from the CRM again)
  async function saveName() {
    if (rename == null) return;
    if (rename.trim() === (row.title || '')) { setRename(null); return; }
    setBusy('name');
    try { const saved = await renameAiProject(row.id, rename); setRename(null); notify(saved ? 'Назву проєкту збережено.' : 'Назву повернуто до назви з CRM.'); await onChanged?.(); } catch (e) { notify(e.message || 'Не вдалося зберегти назву.', true); } finally { setBusy(''); }
  }

  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive pcd-overlay" data-ai-safe>
      <div ref={box} className="ckp-win pcd-win" role="dialog" aria-modal="true" aria-label={`Проєкт ${row.client}`} tabIndex={-1}>
        <header className="ckp-whd pcd-head">
          <Avatar name={row.client} size={48} />
          <div className="ckp-wt">
            {rename == null ? (
              <h2>{row.client}<button type="button" className="pcd-rename" onClick={() => setRename(row.title || row.client)} aria-label="Змінити назву проєкту" title="Змінити назву проєкту"><Ic n="pen" size={15} /></button><span className={'ckp-chip ' + head.tone}>{head.label}</span></h2>
            ) : (
              <div className="pcd-name-edit">
                <input className="ckp-field" autoFocus value={rename} maxLength={TITLE_MAX} onChange={(e) => setRename(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} placeholder={row.crmClient || 'Назва проєкту'} aria-label="Назва проєкту в AI Agents" />
                <small>{rename.length} / {TITLE_MAX}</small>
                <button type="button" className="ckp-btn is-primary is-sm" disabled={busy === 'name'} onClick={saveName}>Зберегти</button>
                <button type="button" className="ckp-btn is-sm" disabled={busy === 'name'} onClick={() => setRename(null)}>Скасувати</button>
              </div>
            )}
            <p>{[row.name && row.name !== row.client ? row.name : '', row.title && row.crmClient && row.crmClient !== row.name && row.crmClient !== row.client ? row.crmClient : '', row.platforms.map((k) => PLATFORM_LABEL[k] || k).join(' + ') || 'без кабінету'].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="pcd-head-actions">
            {done
              ? <button type="button" className="ckp-btn" disabled={!ready} onClick={() => act(onRestore)}><Ic n="refresh" size={16} />Повернути в роботу</button>
              : <button type="button" className="ckp-btn is-ok" disabled={!ready} onClick={() => act(onFinish)}><Ic n="check" size={16} />Завершити проєкт</button>}
            <button type="button" className="ckp-btn is-danger" disabled={!ready} onClick={() => act(onRemove)}><Ic n="trash" size={16} />Видалити проєкт</button>
          </div>
          <button type="button" className="pcd-round" onClick={onClose} aria-label="Закрити картку проєкту" title="Закрити"><Ic n="close" size={18} /></button>
        </header>

        <div className="pcd-mid">
        <nav className="pcd-side" role="tablist" aria-orientation="vertical" aria-label="Розділи проєкту">
          {TABS.map(([k, label, icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={'pcd-tab' + (tab === k ? ' is-on' : '')} onClick={() => { setTab(k); if (k !== 'operations') { setOpenOp(null); } }}>
              <span className="pcd-tab-m"><Ic n={icon} size={16} /></span>
              <span className="pcd-tab-t">{label}</span>
              {k === 'operations' && campaigns ? <em>{campaigns.length}</em> : null}{k === 'overview' && attention.length > 0 ? <em className="is-warn">{attention.length}</em> : null}
            </button>
          ))}
        </nav>

        <div className="ckp-wbody pcd-body">
          {campaigns === null && <div className="ckp-skel ckp-skel-wide" aria-hidden="true" />}

          {campaigns && tab === 'overview' && (
            <>
              {/* no big box around: three plain groups with their own names (the operation, its current cycle, the steps of the cycle), every card inside is named too */}
              <section className="pcd-sect" aria-label="Поточна операція">
                <div className="ckp-sec-h"><h3>Поточна операція</h3>{current && <button type="button" className="ckp-btn is-primary" style={{ marginLeft: 'auto' }} onClick={() => openOperation(current.id)}>Перейти до операції<Ic n="arrow" size={15} /></button>}</div>
                {!current && <p className="ckp-empty-line">{done ? 'Проєкт завершено: активних операцій немає.' : 'Зараз немає операції в роботі. Створіть її в розділі «Операції», щоб агенти почали працювати для цього клієнта.'}</p>}
                {current && (
                  <div className="pcd-facts">
                    <div className="pcd-fact"><span className="pcd-fact-l">Назва операції</span><b>{current.name}</b></div>
                    <div className="pcd-fact"><span className="pcd-fact-l">Тип операції</span><b>{current.modeLabel}</b></div>
                    <div className="pcd-fact"><span className="pcd-fact-l">Стан операції</span><b><span className={'ckp-chip ' + (OP_STATUS[current.status]?.[1] || '')}>{OP_STATUS[current.status]?.[0] || current.status}</span></b></div>
                  </div>
                )}
                {groups.current.length > 1 && <p className="ckp-empty-line">Ще в роботі: {groups.current.slice(1).map((o) => o.name).join(', ')}. Усі операції — у розділі «Операції».</p>}
              </section>
              {current && (
                <section className="pcd-sect" aria-label="Поточне завдання">
                  <div className="ckp-sec-h"><h3>Поточне завдання</h3>{focus && <span className="ckp-chip">№{focus.id} · {focus.kindLabel}</span>}</div>
                  <div className="pcd-duo">
                    <div className={'pcd-pan' + (focusTone ? ' is-' + focusTone : '')}><small>Що зараз у роботі</small><b>{!focus ? 'Нічого не в роботі' : !focus.stage && waitingCycles.length > 1 ? `На перевірці завдань: ${waitingCycles.length} (№${waitingCycles.map((r) => r.id).join(', №')})` : focusNow.now}</b></div>
                    {focus && <span className="pcd-duo-arw" aria-hidden="true"><Ic n="arrow" size={26} /></span>}
                    <div className="pcd-pan"><small>Що буде далі</small><b>{focus ? focusNow.next || '—' : curView?.next ? `Регулярне завдання: ${curView.next.text}` : '—'}</b>{focus && curView?.next && <em>Наступний регулярний запуск: {curView.next.text}</em>}</div>
                    {focus && <ProgressRing value={focusNow.progress} tone={focusTone} />}
                  </div>
                </section>
              )}
              {focus && (
                <section className="pcd-sect" aria-label="Етапи завдання">
                  <div className="ckp-sec-h"><h3>Етапи завдання</h3></div>
                  <StageRoute stages={focus.stages} currentKey={focus.currentStageKey} />
                </section>
              )}
              <div className="pcd-cols">
                <section className="ckp-att" aria-label="Проблеми й що чекає на вас">
                  <div className="ckp-sec-h">
                    <h3>Проблеми й що чекає на вас</h3>
                    {attention.length > 0 ? <span className="ckp-chip is-warn"><Ic n="clock" size={13} />{attention.length}</span> : <span className="ckp-chip is-ok"><Ic n="check" size={13} />нічого</span>}
                    {problems > 0 && <span className="ckp-chip is-bad"><Ic n="warn" size={13} />{problems} {plural(problems, 'проблема', 'проблеми', 'проблем')}</span>}
                  </div>
                  {!attention.length && <p className="ckp-empty-line">Усе гаразд: агентам нічого від вас не потрібно.</p>}
                  <div className="ckp-alist">
                    {attention.map((a) => <AttentionRow key={a.id} item={a} onAction={(item, key, payload) => cockpit.run(item, key, payload)} onShowReview={() => openOperation(a._op.id)} />)}
                  </div>
                </section>
                <section className="ckp-box" aria-label="Витрати проєкту">
                  <div className="ckp-sec-h"><h3>Витрати</h3><button type="button" className="ckp-btn is-sm" style={{ marginLeft: 'auto' }} onClick={() => setTab('spend')}>Докладно</button></div>
                  <div className="ckp-big"><b>{fmtUsd(spend.total)}</b><span>операції в роботі, за весь час</span></div>
                  <div className="ckp-leg"><span><i style={{ background: '#EB9CEF' }} />Claude <b>{fmtUsd(spend.model)}</b></span><span><i style={{ background: '#7C8CF8' }} />Higgsfield <b>{fmtUsd(spend.higgsfield)}</b></span></div>
                </section>
              </div>
            </>
          )}

          {campaigns && tab === 'operations' && !opRow && (
            <>
            <div className="pcd-opbar pcd-opsbar">
              <b>Операції проєкту</b>
              <span className="pcd-opbar-sp" />
              {!done && (activeIds.length > 0 || pausedIds.length > 0) && <button type="button" className="ckp-btn" disabled={busy === 'stop'} onClick={stopAll}><Ic n={!activeIds.length && pausedIds.length ? 'play' : 'stop'} size={16} />{!activeIds.length && pausedIds.length ? 'Відновити всі операції' : 'Зупинити всі операції'}</button>}
              {!done && <button type="button" className="ckp-btn is-primary" onClick={() => setWizard(true)}><Ic n="plus" size={16} />Нова операція</button>}
            </div>
            <div className="pcd-ocols">
              {[['current', 'Поточні'], ['planned', 'Заплановані'], ['finished', 'Завершені']].map(([k, label]) => (
                <section key={k} className={'pcd-ocol is-' + k} aria-label={label}>
                  <div className="pcd-ocol-h"><i aria-hidden="true" /><h3>{label}</h3><span className="ckp-chip">{groups[k].length}</span></div>
                  {!groups[k].length && <p className="ckp-empty-line">{k === 'current' ? 'Немає операцій у роботі.' : k === 'planned' ? 'Немає створених, але ще не запущених операцій.' : 'Завершених операцій ще немає.'}</p>}
                  <div className="pcd-ops">{groups[k].map((op) => <OpRow key={op.id} op={op} onOpen={openOperation} />)}</div>
                </section>
              ))}
            </div>
            </>
          )}

          {campaigns && tab === 'operations' && opRow && (
            <>
              <div className="pcd-opbar">
                <button type="button" className="pcd-round" onClick={() => setOpenOp(null)} aria-label="До всіх операцій проєкту" title="До всіх операцій проєкту"><Ic n="back" size={18} /></button>
                <NameEdit value={opRow.name} label="Назва операції" onSave={async (name) => { await updateCampaign(opRow.id, { name }); notify('Назву операції збережено.'); await changed(); }} />
                <span className="ckp-chip">{modeLabelOf(opRow)}</span>
                <span className={'ckp-chip ' + (OP_STATUS[opRow.status]?.[1] || '')}>{OP_STATUS[opRow.status]?.[0] || opRow.status}</span>
                <span className="pcd-opbar-sp" />
                {['active', 'paused'].includes(opRow.status) && <button type="button" className="ckp-btn" disabled={busy === 'op'} onClick={() => toggleOp(opRow)}><Ic n={opRow.status === 'paused' ? 'play' : 'stop'} size={16} />{opRow.status === 'paused' ? 'Відновити операцію' : 'Зупинити операцію'}</button>}
              </div>
              {/* a launched operation shows its six sections; a draft or an archived one keeps the full page (launch, restore, delete) */}
              {['active', 'paused'].includes(opRow.status)
                ? <OperationView key={opRow.id} campaign={opRow} cockpit={opCockpit} project={project} loading={cockpit.loading} run={cockpit.run} notify={notify} onChanged={changed}
                    onBack={() => { setOpenOp(null); changed(); }} onOpenAgents={() => { setOpenOp(null); setTab('agents'); }} regularFirst={regularFirst} />
                : (
                  <div className="cmp-section pcd-embed">
                    <CampaignPage key={opRow.id} campaign={opRow} project={project} notify={notify} onBack={() => { setOpenOp(null); changed(); }} onChanged={changed} />
                  </div>
                )}
            </>
          )}

          {campaigns && tab === 'agents' && <AgentsSettings campaigns={campaigns} currentId={current?.id ?? null} notify={notify} onChanged={changed} />}

          {campaigns && tab === 'spend' && <div className="pcd-embed pcd-spend"><CampaignSpend projectId={row.id} onOpenCampaign={(id) => openOperation(id)} /></div>}

          {campaigns && tab === 'info' && (
            <div className="pcd-sheet" data-dd="plum">
              <div className="pcd-infolink">
                <p>Усю інформацію про проєкт заповнюють і змінюють лише в картці проєкту: ті самі дані читають агенти. Тут видно, чого їм ще бракує.</p>
                <a className="btn btn-p" href={`/projects/${row.id}`} target="_blank" rel="noreferrer noopener">Відкрити «Інформація про проєкт» ↗</a>
              </div>
              <ProjectCreativeTab key={'pcd-' + row.id} projectId={row.id} section="ready" crmLink embedded />
            </div>
          )}
        </div>
        </div>
      </div>
      {wizard && project && (
        <CreateCampaignWizard
          initialProjectId={row.id} notify={notify}
          onClose={() => { setWizard(false); changed(); }}
          onLaunched={(id, opts) => { setWizard(false); changed().then(() => { setTab('operations'); setOpenOp(id); setRegularFirst(Boolean(opts?.newRequest)); }); }}
        />
      )}
      {toast && <div className={'ckp-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
      {confirmDialog}
    </div>,
    document.body,
  );
}
