import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { updateCampaign } from '../../../lib/api/campaigns';
import { kickQueue } from '../../../lib/api/agents';
import { renameRegular, renameRequest, runRegularNow, setRegularEnabled } from '../../../lib/api/operationCycles';
import { startRequest } from '../../../lib/api/creatives';
import { regularsOf } from '../../../lib/agents/operationCycles';
import { tasksOfOperation } from '../../../lib/agents/taskScope';
import { useAuth } from '../../../contexts/AuthContext';
import { modeLabelOf } from '../../../lib/agents/projectCockpit';
import { PLATFORM_LABEL } from '../../../lib/agents/aiProjects';
import NameEdit from './NameEdit';
import OperationView from './OperationView';
import { Avatar, Ic } from './parts';
import '../../../styles/aiAgentsSection.css';
import '../../../styles/agentAnalyticsPage.css';
import '../../../styles/agentSpendPage.css';
import '../../../styles/campaignsSection.css';
import './cockpit.css';
import './ProjectCard.css';

const TASK_TONE = { work: 'is-work', wait: 'is-warn', stopped: 'is-bad', done: 'is-ok', paused: '', soon: '' };
const OP_STATUS = { active: ['працює', 'is-work'], paused: ['на паузі', ''], draft: ['не запущена', 'is-grey'], archived: ['завершена', 'is-ok'] };

// The card of ONE operation on the whole screen, opened from anywhere outside the card of a project (the section «Операції», the calendar, «Витрати»):
// the same six sections as inside the project card (OperationView), with its own head: the client, the operation, its state, stop / resume, the way to the project.
//   campaign: the ag_campaigns row  project: { id, name, client }  cockpit: useProjectCockpit()  regularFirst: just created → the regular cycle form opens
//   onOpenProject(projectId, operationId): opens the card of the project (not shown when the project is not in the section)
//   onBackToProject(): opened from the card of the project in the CRM: the first button of the head «До проєкту» brings the person back there
//   taskKey (step 3.0b): the card of ONE task of the operation (`reg:<id>` | `one:<id>`): its results, its work, its settings (the agents' ones too), its money
//   teamOnly: the card of the team («Налаштування команди»): what is the same for all tasks of the client: the profile and the style, the limit, the money
export default function OperationCard({ campaign, project, cockpit, regularFirst = false, onClose, onChanged, onOpenProject, onBackToProject = null, onGoFill = null, taskKey = null, teamOnly = false }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4500); }, []);
  // Escape closes what is on top: a dialog opened from the card closes itself, then the card
  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-name-edit]')) return; // the name is being edited: its field takes Escape
      if (document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length > 1 || document.querySelector('.ui-select-menu:not(.closing)')) return;
      onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changed = useCallback(async () => { await Promise.all([onChanged?.(), cockpit.reload?.()]); }, [onChanged, cockpit]);
  async function toggle() {
    setBusy(true);
    try { await updateCampaign(campaign.id, { status: campaign.status === 'paused' ? 'active' : 'paused' }); if (campaign.status === 'paused') kickQueue().catch(() => {}); notify(campaign.status === 'paused' ? 'Операцію відновлено.' : 'Операцію зупинено.'); await changed(); } catch (e) { notify(e.message || 'Не вдалося змінити операцію.', true); } finally { setBusy(false); }
  }
  const client = project?.client || project?.name || campaign.name;
  const task = taskKey ? tasksOfOperation({ campaign, cockpit: cockpit.byId?.[campaign.id] || null }).find((t) => t.key === taskKey) || null : null;
  const regular = task?.regularId ? regularsOf(campaign).find((r) => r.id === task.regularId) || null : null;
  const request = task?.requestId != null ? (cockpit.byId?.[campaign.id]?.requests || []).find((r) => r.id === task.requestId) || null : null;
  const stoppedOp = campaign.status === 'paused';
  async function runTask() {
    setBusy(true);
    try {
      if (regular) await runRegularNow(campaign, regular, email); else if (request) await startRequest(request.id);
      kickQueue().catch(() => {}); notify('Завдання запущено: агенти працюють.'); await changed();
    } catch (e) { notify(e?.message || 'Не вдалося запустити завдання.', true); } finally { setBusy(false); }
  }
  async function toggleTask() {
    setBusy(true);
    try { await setRegularEnabled(campaign.id, regular.id, !regular.enabled, email); notify(regular.enabled ? 'Регулярне завдання вимкнено.' : 'Регулярне завдання увімкнено.'); await changed(); } catch (e) { notify(e?.message || 'Не вдалося змінити завдання.', true); } finally { setBusy(false); }
  }
  const preparing = campaign.status === 'active' && cockpit.byId?.[campaign.id]?.intel?.status === 'running'; // the scout is studying the client: the team prepares before it works
  const [label, tone] = preparing ? ['підготовка', 'is-warn'] : (OP_STATUS[campaign.status] || [campaign.status, '']);
  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive pcd-overlay" data-ai-safe>
      <div ref={box} className="ckp-win pcd-win" role="dialog" aria-modal="true" aria-label={task ? `Завдання ${task.title}` : teamOnly ? `Налаштування команди ${campaign.name}` : `Операція ${campaign.name}`} tabIndex={-1}>
        <header className="ckp-whd pcd-head">
          {onBackToProject && <button type="button" className="ckp-btn pcd-back" onClick={onBackToProject}><Ic n="back" size={16} />До проєкту</button>}
          <Avatar name={client} size={48} />
          <div className="ckp-wt">
            {task ? (
              <div className="pcd-optitle"><NameEdit as="h2" value={task.title} label="Назва завдання" onSave={async (name) => { if (regular) await renameRegular(campaign.id, regular.id, name); else if (request) await renameRequest(request.id, name); notify('Назву завдання збережено.'); await changed(); }} /><span className="ckp-chip">{task.kindLabel}</span><span className={'ckp-chip ' + (TASK_TONE[task.state] || '')}>{task.stateText}</span></div>
            ) : teamOnly ? (
              <div className="pcd-optitle"><h2>Налаштування команди</h2><span className={'ckp-chip ' + tone}>{label}</span></div>
            ) : (
            <div className="pcd-optitle"><NameEdit as="h2" value={campaign.name} label="Назва операції" onSave={async (name) => { await updateCampaign(campaign.id, { name }); notify('Назву операції збережено.'); await changed(); }} /><span className="ckp-chip">{modeLabelOf(campaign)}</span><span className={'ckp-chip ' + tone}>{label}</span></div>
            )}
            <p>{task ? [client, 'Креативи', task.line].filter(Boolean).join(' · ') : teamOnly ? [client, 'Креативи', 'профіль клієнта, ліміти, витрати'].join(' · ') : [client, (campaign.platforms || []).map((k) => PLATFORM_LABEL[k] || k).join(' + ')].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="pcd-head-actions">
            {onOpenProject && campaign.project_id != null && <button type="button" className="ckp-btn" onClick={() => onOpenProject(campaign.project_id, campaign.id)}><Ic n="folder" size={16} />Картка проєкту</button>}
            {task && (regular || request?.status === 'draft') && <button type="button" className="ckp-btn is-primary" disabled={busy || stoppedOp} title={stoppedOp ? 'Команда на паузі: спочатку відновіть її в налаштуваннях команди' : undefined} onClick={runTask}><Ic n="play" size={16} />{request ? 'Запустити' : 'Запустити зараз'}</button>}
            {task && regular && <button type="button" className="ckp-btn" disabled={busy} onClick={toggleTask}><Ic n={regular.enabled ? 'stop' : 'play'} size={16} />{regular.enabled ? 'Вимкнути завдання' : 'Увімкнути завдання'}</button>}
            {!task && <button type="button" className="ckp-btn" disabled={busy} onClick={toggle}><Ic n={campaign.status === 'paused' ? 'play' : 'stop'} size={16} />{campaign.status === 'paused' ? 'Відновити команду' : 'Зупинити команду'}</button>}
          </div>
          <button type="button" className="ckp-x ckp-x-lg" onClick={onClose} aria-label={task ? 'Закрити картку завдання' : 'Закрити картку'}><Ic n="close" size={17} /></button>
        </header>
        <div className="ckp-wbody pcd-body">
          <OperationView key={`${campaign.id}:${taskKey || ''}:${teamOnly ? 't' : ''}`} campaign={campaign} cockpit={cockpit.byId[campaign.id] || null} project={project} loading={cockpit.loading} run={cockpit.run} notify={notify}
            onChanged={changed} onBack={() => { onClose?.(); }} regularFirst={regularFirst} onGoFill={onGoFill} task={task} teamOnly={teamOnly} />
        </div>
      </div>
      {toast && <div className={'ckp-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
    </div>,
    document.body,
  );
}
