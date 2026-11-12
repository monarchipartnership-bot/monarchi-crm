import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCampaigns, fetchClientsForCampaigns } from '../../../lib/api/campaigns';
import { TASK_FILTERS, allTasks, groupByProject, matchesFilter } from '../../../lib/agents/taskScope';
import { fmtUsd } from '../cockpit/format';
import OperationCard from '../cockpit/OperationCard';
import NewTaskDialog from './NewTaskDialog';
import { hasCreativeCycles } from '../../../lib/agents/operationCycles';
import { CampaignCalendar } from '../campaigns/OperationTools';
import '../../../styles/aiAgentsSection.css';
import '../../../styles/campaignsSection.css';
import '../../../styles/tasksSection.css';

const STATE_CLS = { work: 'is-work', wait: 'is-wait', stopped: 'is-bad', paused: 'is-paused', soon: 'is-paused', done: 'is-done' };

// «Задачі» (owner, 2026-11-12, step 3.0b): the tasks of all the creative teams in one list, instead of «Операції». A project is a group, a task is a row; a click opens the card of THAT task.
// Variant A of the mockup: rows grouped by project, the filters above. The calendar of the old operations stays as a second view.
//   cockpit: useProjectCockpit() of the page   onOpenProject(projectId): the card of the project   openCampaignId: an operation to open at once (from «Витрати»)
export default function TasksSection({ cockpit, onOpenProject = null, openCampaignId = null }) {
  const [campaigns, setCampaigns] = useState(null);
  const [projects, setProjects] = useState([]);
  const [filter, setFilter] = useState('all'); // all | wait | work | paused | archive | calendar
  const [newTask, setNewTask] = useState(false);
  const [toast, setToast] = useState(null);
  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4500); }, []);
  const [card, setCard] = useState(openCampaignId != null ? { campaignId: openCampaignId, taskKey: null, teamOnly: true } : null); // { campaignId, taskKey?, teamOnly? }

  const reload = useCallback(async () => {
    const [c, p] = await Promise.all([fetchCampaigns().catch(() => null), fetchClientsForCampaigns().catch(() => [])]);
    setCampaigns(c); setProjects(p);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const byId = cockpit?.byId || {};
  const projectRows = useMemo(() => { // the names come from the cabinets (the client), the list of projects fills the rest
    const rows = new Map(projects.map((p) => [p.id, { id: p.id, name: p.name, client: p.client || p.name }]));
    Object.values(byId).forEach((c) => { if (c.projectId != null) rows.set(c.projectId, { id: c.projectId, name: c.client || rows.get(c.projectId)?.name || '', client: c.client || rows.get(c.projectId)?.client || '' }); });
    return [...rows.values()];
  }, [projects, byId]);
  const tasks = useMemo(() => allTasks({ campaigns: campaigns || [], cockpits: byId, projects: projectRows }), [campaigns, byId, projectRows]);
  const counts = useMemo(() => Object.fromEntries(TASK_FILTERS.map(([k]) => [k, tasks.filter((t) => matchesFilter(t, k)).length])), [tasks]);
  const shown = useMemo(() => tasks.filter((t) => matchesFilter(t, filter)), [tasks, filter]);
  const groups = useMemo(() => groupByProject(shown), [shown]);
  const names = useMemo(() => Object.fromEntries(projectRows.map((p) => [p.id, p.client || p.name])), [projectRows]);
  const creativeCampaigns = useMemo(() => (campaigns || []).filter((c) => ['active', 'paused'].includes(c.status) && hasCreativeCycles(c)), [campaigns]);
  const openCampaign = card ? (campaigns || []).find((c) => c.id === card.campaignId) || null : null;
  const projectOf = (id) => projectRows.find((p) => p.id === id) || null;
  const cockpitReady = !!campaigns && !cockpit?.loading;

  const openTask = (t) => setCard({ campaignId: t.campaignId, taskKey: t.key });
  return (
    <div className="ai-section cmp-section ts-section" role="region" aria-label="Задачі команд">
      {toast && <div className={'cmp-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}
      <div className="ai-section-head cmp-head">
        <div className="cmp-head-tt">
          <div className="ai-section-kicker">Команди агентів</div>
          <h1>Задачі</h1>
          <p>Усі задачі креативних команд клієнтів: регулярні, сезонні й разові. Відкрийте задачу, щоб побачити її результати, хід роботи й налаштувати кожного агента саме для неї.</p>
        </div>
        <div className="cmp-rings" role="group" aria-label="Підсумок">
          <div className={'cmp-ringc' + (counts.wait ? ' is-bad' : '')}><b>{counts.wait}</b><small>чекають на вас</small></div>
          <div className="cmp-ringc"><b>{counts.work}</b><small>працюють</small></div>
          <div className="cmp-ringc"><b>{counts.paused}</b><small>на паузі</small></div>
        </div>
      </div>

      <div className="cmp-onebar" role="group" aria-label="Задачі">
        <button type="button" className="cmp-ob-btn cmp-ob-main" onClick={() => setNewTask(true)}>Нова задача</button>
        <span className="cmp-ob-sep" aria-hidden="true" />
        <div className="cmp-ob-views" role="tablist" aria-label="Фільтр задач">
          {TASK_FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{label}<em>{counts[k]}</em></button>
          ))}
          <button type="button" role="tab" aria-selected={filter === 'calendar'} className={filter === 'calendar' ? 'on' : ''} onClick={() => setFilter('calendar')}>Календар</button>
        </div>
      </div>

      {filter === 'calendar' && campaigns && <CampaignCalendar campaigns={campaigns} projects={projects} onOpen={(id) => setCard({ campaignId: id, taskKey: null, teamOnly: true })} />}
      {filter !== 'calendar' && !cockpitReady && <div className="ai-section-empty">Завантаження задач…</div>}
      {filter !== 'calendar' && cockpitReady && !groups.length && (
        <div className="ai-section-empty">{filter === 'archive' ? 'В архіві поки порожньо.' : filter === 'all' ? 'Задач ще немає. Додайте їх у картці проєкту, у вкладці «Запуск AI команди».' : 'За цим фільтром задач немає.'}</div>
      )}
      {filter !== 'calendar' && cockpitReady && groups.map((g) => (
        <section key={g.projectId ?? 'x'} className="ts-group" aria-label={g.projectName}>
          <div className="ts-gh">
            <b>{g.projectName}</b>
            {g.campaignStatus === 'paused' && <span className="ts-pill is-paused">команда на паузі</span>}
            <span className="ts-gh-acts">
              <button type="button" className="ts-link" onClick={() => setCard({ campaignId: g.tasks[0].campaignId, taskKey: null, teamOnly: true })}>Налаштування команди</button>
              {onOpenProject && g.projectId != null && <button type="button" className="ts-link" onClick={() => onOpenProject(g.projectId)}>Картка проєкту</button>}
            </span>
          </div>
          <ul className="ts-list">
            {g.tasks.map((t) => (
              <li key={t.campaignId + t.key} className="ts-row">
                <div className="ts-main">
                  <b>{t.title}</b>
                  <small>{[t.kindLabel, t.line].filter(Boolean).join(' · ')}</small>
                </div>
                <span className={'ts-pill ' + (STATE_CLS[t.state] || '')}>{t.stateText}</span>
                <span className="ts-n">{t.review ? `на перевірці: ${t.review}` : t.approved ? `затверджено: ${t.approved}` : '—'}</span>
                <span className="ts-n">{t.costUsd ? fmtUsd(t.costUsd) : '—'}</span>
                <button type="button" className="cmp-ob-btn ts-open" onClick={() => openTask(t)}>Відкрити</button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {newTask && <NewTaskDialog campaigns={creativeCampaigns} names={names} onClose={() => setNewTask(false)} onCreated={(text) => { notify(text); reload(); cockpit?.reload?.(); }} />}
      {openCampaign && (
        <OperationCard key={`${openCampaign.id}:${card.taskKey || ''}`} campaign={openCampaign} project={projectOf(openCampaign.project_id)} cockpit={cockpit} taskKey={card.taskKey || null} teamOnly={!!card.teamOnly}
          onChanged={reload} onClose={() => { setCard(null); reload(); }}
          onOpenProject={onOpenProject ? (pid) => { setCard(null); onOpenProject(pid); } : undefined} />
      )}
    </div>
  );
}
