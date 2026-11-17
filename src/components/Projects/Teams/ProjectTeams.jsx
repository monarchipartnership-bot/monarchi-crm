import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import useProjectCockpit from '../../../lib/useProjectCockpit';
import { fetchCampaignControl } from '../../../lib/api/campaignControl';
import { deleteTeam, fetchTeamsData, setTeamRunning } from '../../../lib/api/teams';
import { useConfirm } from '../../common/ConfirmDialog';
import { TEAMS, teamRoles, teamsOf } from '../../../lib/agents/teams';
import { describeRegular, kyivToday, pausedBySeason, regularsOf, seasonOver } from '../../../lib/agents/operationCycles';
import { dayMonthOf } from '../../../lib/agents/scheduleCalendar';
import { removeRegular, renameRegular, renameRequest, setRegularEnabled } from '../../../lib/api/operationCycles';
import OperationCard from '../../../pages/Tools/cockpit/OperationCard';
import { fmtDateTime } from '../../../pages/Smm/agentUi';
import { HubTitle } from '../hubIcons';
import LaunchTeamWizard from './LaunchTeamWizard';
import TeamCard from './TeamCard';
import TeamsBoard from './TeamsBoard';
import NewTaskWizard from './NewTaskWizard';
import TeamPrep from './TeamPrep';
import { teamPhase, teamTasksOf } from '../../../lib/agents/teamTasks';
import { TeamRing, TypeMedal, toStatus } from './teamsUi';
import '../../../styles/projectTeams.css';
import '../../../styles/projectTeamsPlum.css';

const STATE = { running: ['працює', 'is-ok'], paused: ['зупинено', 'is-wait'], preparing: ['підготовка', 'is-wait'] };
const WEEKDAYS = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];

// «Запуск AI команди» of the card of the project (owner, 2026-11-11): the teams that work for the client (creatives, analytics, reports), the launch of a new one
// (choose → check what is filled → settings of the agents → summary and price) and the control of the running ones. Everything the teams read is in the card of the project.
//   projectId  onGoFill(section): opens that section of «Інформація про проєкт»   onOpenReports(): opens the tab of the report agent
export default function ProjectTeams({ projectId, onGoFill, onOpenReports, onOpenMaterials }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const cockpit = useProjectCockpit({ enabled: true });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [open, setOpen] = useState(null); // { campaignId, regularFirst }: the operation card (the cycles of creatives)
  const [oneoff, setOneoff] = useState(false); // the dialog of a new task (the kind may be chosen in the menu already)
  const [oneoffKind, setOneoffKind] = useState(null); // 'regular' | 'seasonal' | 'oneoff' chosen in the menu «+ Нове завдання»
  const [menu, setMenu] = useState(false); // the menu «+ Нове завдання»
  const menuRef = useRef(null);
  const [card, setCard] = useState(null); // the key of the team whose card (agents, schedules, money) is open
  const [control, setControl] = useState({}); // campaign id -> the agents with their last and next runs
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const say = useCallback((text, bad = false) => { setNote({ text, bad }); setTimeout(() => setNote(null), bad ? 8000 : 4500); }, []);

  const load = useCallback(async () => {
    try { setData(await fetchTeamsData(projectId)); setError(''); } catch (e) { setError(e?.message || 'Не вдалося завантажити команди.'); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!menu) return undefined;
    const away = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [menu]);

  const view = useMemo(() => (data ? teamsOf({ campaigns: data.campaigns, agent: data.agent }) : null), [data]);
  // the last and the next run of the agents of every running team
  useEffect(() => {
    if (!view) return;
    const ids = view.teams.filter((t) => t.campaign).map((t) => t.campaign.id);
    ids.forEach((id) => { fetchCampaignControl(id).then((c) => setControl((m) => ({ ...m, [id]: c }))).catch(() => {}); });
  }, [view]);

  async function toggle(team) {
    setBusy(team.key);
    try { await setTeamRunning(team, team.state !== 'running', email); say(team.state === 'running' ? `Команду «${team.def.title}» зупинено: агенти не запускаються, поки ви її не продовжите.` : `Команду «${team.def.title}» продовжено.`); await Promise.all([load(), cockpit.reload?.()]); } catch (e) { say(e?.message || 'Не вдалося змінити команду.', true); } finally { setBusy(''); }
  }

  const GONE = {
    creative: 'Будуть видалені всі завдання, запити й креативи цієї команди, а також її налаштування. Відновити їх не можна.',
    analytics: 'Будуть видалені агенти команди, їхні звіти, плани дій і історія витрат. Відновити їх не можна.',
    reports: 'Агента звітів буде відключено від проєкту: розклад і налаштування зникнуть. Звіти, які вже є в «Історії проєкту», залишаться.',
  };
  async function remove(team) {
    if (!(await confirm({ title: `Видалити команду «${team.def.title}»?`, body: GONE[team.key], confirmLabel: 'Видалити команду' }))) return;
    setBusy(team.key);
    try { await deleteTeam(team, email); say(`Команду «${team.def.title}» видалено.`); await Promise.all([load(), cockpit.reload?.()]); } catch (e) { say(e?.message || 'Не вдалося видалити команду.', true); } finally { setBusy(''); }
  }

  // the seasonal tasks of the creative team (a season that is over is not shown here) and what they do to the main regular task
  const creativeCampaign = view?.teams.find((t) => t.key === 'creative')?.campaign || null;
  async function seasonAction(r, kind) {
    if (kind === 'remove' && !(await confirm({ title: `Видалити сезонне завдання «${r.title}»?`, body: 'Воно більше не запускатиметься, а основне регулярне завдання повернеться до роботи. Уже зроблені за ним креативи лишаться.', confirmLabel: 'Видалити' }))) return;
    setBusy('season:' + r.id);
    try {
      if (kind === 'remove') { await removeRegular(creativeCampaign.id, r.id); say(`Сезонне завдання «${r.title}» видалено.`); }
      else { await setRegularEnabled(creativeCampaign.id, r.id, kind === 'resume', email); say(kind === 'resume' ? `Сезонне завдання «${r.title}» продовжено.` : `Сезонне завдання «${r.title}» зупинено.`); }
      await Promise.all([load(), cockpit.reload?.()]);
    } catch (e) { say(e?.message || 'Не вдалося виконати.', true); } finally { setBusy(''); }
  }
  const runningTeams = view ? view.teams.filter((t) => t.state !== 'none') : [];
  const empty = view && !runningTeams.length;
  const project = data?.project ? { id: data.project.id, name: data.project.name, client: data.project.client } : null;
  const openCampaign = open && data ? data.campaigns.find((c) => c.id === open.campaignId) : null;

  function summary(t) {
    if (t.key === 'reports') {
      const cfg = t.agent?.config || {};
      const w = cfg.tasks?.weeklyReport ? `тижневий: ${WEEKDAYS[(cfg.schedule?.weeklyDay || 1) - 1]} о ${cfg.schedule?.weeklyTime || '09:00'}` : '';
      const m = cfg.tasks?.monthlyReport ? `місячний: ${cfg.schedule?.monthlyDay || 1}-го о ${cfg.schedule?.monthlyTime || '09:00'}` : '';
      return [[w, m].filter(Boolean).join(' · ') || 'розклад не задано', t.agent?.last_run_at ? `останній запуск ${fmtDateTime(t.agent.last_run_at)}` : 'ще не запускалась'];
    }
    const ctl = control[t.campaign.id];
    // the main regular task rests while a season replaces it: said on the card of the team
    const rest = t.key === 'creative' ? regularsOf(t.campaign).filter((r) => r.enabled && !r.seasonal).map((r) => pausedBySeason(t.campaign, r)).filter(Boolean)[0] : null;
    if (rest && t.state === 'running') return ['агентів працює: за запитом', `основне завдання на паузі до ${dayMonthOf(rest.endDate)}: сезонне «${rest.title}»`];
    const on = (ctl?.agents || []).filter((a) => a.mode !== 'paused');
    const nextAt = on.map((a) => a.nextAt).filter(Boolean).sort()[0];
    const last = on.map((a) => a.lastRunAt).filter(Boolean).sort().pop();
    return [ctl ? (t.state === 'paused' ? (t.key === 'creative' ? 'команда на паузі: регулярні завдання не запускаються' : `агентів у команді: ${on.length}, команда на паузі`) : `агентів працює: ${on.length || (t.key === 'creative' ? 'за запитом' : 0)}`) : 'завантажуємо агентів…', [last ? `останній запуск ${fmtDateTime(last)}` : 'ще не запускались', nextAt ? `найближчий ${fmtDateTime(nextAt)}` : ''].filter(Boolean).join(' · ')];
  }

  // the tasks of every team as cards (owner's picks 2026-11-16, decision 51): the creative team has its own tasks; for the analytics team every agent with its schedule is a regular task,
  // for the reports team the weekly and the monthly report are
  async function renameTask(campaign, task, name) {
    if (task.regularId) await renameRegular(campaign.id, task.regularId, name); else await renameRequest(task.requestId, name);
    say(`Завдання названо «${name}».`); await Promise.all([load(), cockpit.reload?.()]);
  }
  function tasksOf(t) {
    if (t.key === 'creative' && t.campaign) {
      return teamTasksOf({ campaign: t.campaign, cockpit: cockpit.byId?.[t.campaign.id] }).map((k) => ({
        key: k.key, type: k.type, isMain: k.isMain, title: k.title, line: k.line, status: toStatus(k.state), statusText: k.stateText, hint: k.line, cta: 'Переглянути',
        onOpen: () => setOpen({ campaignId: t.campaign.id, regularFirst: false, taskKey: k.key }), onRename: (name) => renameTask(t.campaign, k, name),
        actions: k.type === 'seasonal' ? [
          { label: k.enabled ? 'Зупинити' : 'Продовжити', disabled: busy === 'season:' + k.regularId, onClick: () => seasonAction({ id: k.regularId, title: k.title, enabled: k.enabled }, k.enabled ? 'stop' : 'resume') },
          { label: 'Видалити', disabled: busy === 'season:' + k.regularId, onClick: () => seasonAction({ id: k.regularId, title: k.title, enabled: k.enabled }, 'remove') },
        ] : [],
      }));
    }
    if (t.key === 'analytics' && t.campaign) {
      const roles = new Set(teamRoles('analytics', data?.accounts || []));
      return (control[t.campaign.id]?.agents || []).filter((a) => roles.has(a.role)).map((a) => {
        const off = a.mode === 'paused' || t.state !== 'running';
        return { key: 'ag:' + a.id, type: 'regular', isMain: false, title: a.name, line: [a.lastRunAt ? `останній запуск ${fmtDateTime(a.lastRunAt)}` : 'ще не запускався', a.nextAt && !off ? `наступний ${fmtDateTime(a.nextAt)}` : ''].filter(Boolean).join(' · '), status: off ? 'pause' : 'run', onOpen: () => setCard('analytics'), actions: [] };
      });
    }
    if (t.key === 'reports') {
      const cfg = t.agent?.config || {}; const off = t.state !== 'running';
      const last = t.agent?.last_run_at ? `останній ${fmtDateTime(t.agent.last_run_at)}` : 'ще не запускався';
      const mk = (key, title, when) => ({ key, type: 'regular', isMain: false, title, line: `${when} · ${last}`, status: off ? 'pause' : 'run', onOpen: () => onOpenReports?.(), actions: [] });
      return [
        cfg.tasks?.weeklyReport && mk('rep:w', 'Тижневий звіт', `${WEEKDAYS[(cfg.schedule?.weeklyDay || 1) - 1]} о ${cfg.schedule?.weeklyTime || '09:00'}`),
        cfg.tasks?.monthlyReport && mk('rep:m', 'Місячний звіт', `${cfg.schedule?.monthlyDay || 1}-го числа о ${cfg.schedule?.monthlyTime || '09:00'}`),
      ].filter(Boolean);
    }
    return [];
  }
  const boardTeams = runningTeams.map((t) => {
    const phase = teamPhase(t, t.campaign ? cockpit.byId?.[t.campaign.id] : null); // a launched team prepares before it works
    const [stateLabel, tone] = STATE[phase.phase] || STATE[t.state];
    return {
      key: t.key, title: t.def.title, stateLabel, tone, running: t.state === 'running', busy: busy === t.key, line: summary(t)[1],
      prep: t.key === 'creative' ? <TeamPrep phase={phase} /> : null, tasks: tasksOf(t),
      settingsLabel: t.key === 'reports' ? 'Налаштування й звіти' : 'Налаштування команди',
      onSettings: () => (t.key === 'reports' ? onOpenReports?.() : t.key === 'analytics' ? setCard('analytics') : setOpen({ campaignId: t.campaign.id, regularFirst: false, teamOnly: true })),
      onToggle: () => toggle(t), onRemove: () => remove(t),
    };
  });
  const lead = 'Команди, які працюють для цього клієнта. Усе, що вони читають, береться з розділу «Інформація про проєкт».';
  const NEW_KINDS = [['regular', 'Регулярне', 'Повторюється за розкладом: кожні N днів або в обрані дні.'], ['seasonal', 'Сезонне', 'На обраний період. Основне регулярне завдання на цей час ставиться на паузу.'], ['oneoff', 'Разове', 'Один раз: результат ви переглядаєте й затверджуєте.']];
  const newButtons = (
    <div className="tmx-btns" ref={menuRef}>
      <button type="button" className="btn" onClick={() => setWizard(true)}>+ Запустити команду</button>
      <button type="button" className="btn btn-p" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>+ Нове завдання <span aria-hidden="true">▾</span></button>
      {menu && (
        <div className="tb-menu" role="menu">
          {NEW_KINDS.map(([k, title, text]) => (
            <button key={k} type="button" role="menuitem" className="tb-mi" onClick={() => { setMenu(false); setOneoffKind(k); setOneoff(true); }}>
              <TypeMedal type={k} size={36} />
              <span><b>{title}</b><small>{text}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="pcr-wrap tm tmx pw-dark" data-dd="night">
        <section className={'tmx-box' + (empty ? ' is-open' : '')} aria-label="Запуск AI команди">
          <div className="tmx-bh">
            <div><HubTitle icon="users">Запуск AI команди</HubTitle><p className="tmx-lead">{lead}</p></div>
            {view && newButtons}
          </div>
        </section>
        {note && <p className={'tm-note' + (note.bad ? ' is-bad' : '')} role="status">{note.text}</p>}
        {error && <p className="pcr-error" role="alert">{error}</p>}
        {!view && !error && <div className="pcr-empty">Завантаження…</div>}

        {empty && (
          <section className="tmx-box tmx-empty">
            <b>На даний момент AI команди не запущені</b>
            <div className="tmx-flow">
              {TEAMS.map((d, i) => <span key={d.key} className="tmx-flow-i">{i > 0 && <span className="tmx-ln" aria-hidden="true" />}<span className="tmx-nd"><TeamRing name={d.key} size={44} />{d.title}</span></span>)}
            </div>
            <p>Команди працюють разом: креативи беруть висновки аналітики, звіти збирають результат. Перед запуском система перевірить, чи все заповнено, і покаже, що ще треба додати.</p>
            <button type="button" className="btn btn-p" onClick={() => setWizard(true)}>Запустити команду</button>
          </section>
        )}

        {!empty && view && <TeamsBoard teams={boardTeams} />}
      </div>

      <div className="tm-dialogs" data-dd="hub">
        {confirmDialog}

      {wizard && data && (
        <LaunchTeamWizard data={data} reload={load} email={email}
          onGoFill={(section) => { setWizard(false); onGoFill?.(section); }}
          onClose={() => setWizard(false)}
          onLaunched={async (launched) => {
            setWizard(false); await Promise.all([load(), cockpit.reload?.()]);
            const bad = launched.find((x) => x.startError);
            say(`Запущено: ${launched.map((x) => x.title).join(', ')}.${bad ? ` Перший запуск креативів не стартував: ${bad.startError} Він піде за розкладом.` : ''}`, !!bad);
          }} />
      )}
      {oneoff && data && view && (
        <NewTaskWizard key={oneoffKind} data={data} view={view} email={email} initialKind={oneoffKind || 'oneoff'} onClose={() => { setOneoff(false); setOneoffKind(null); }}
          onCreated={() => { load(); cockpit.reload?.(); }}
          onOpenTask={(taskKey) => { const c = view.teams.find((t) => t.key === 'creative')?.campaign; if (c) setOpen({ campaignId: c.id, regularFirst: false, taskKey }); }}
          onOpenReports={() => onOpenReports?.()} onOpenMaterials={() => onOpenMaterials?.()} onGoFill={(section) => onGoFill?.(section)} />
      )}
      {card && data && view?.teams.find((x) => x.key === card && x.campaign) && (
        <TeamCard key={card} team={view.teams.find((x) => x.key === card)} data={data}
          onClose={() => { setCard(null); load(); }} onChanged={() => { load(); cockpit.reload?.(); }}
          onGoFill={(section) => { setCard(null); onGoFill?.(section); }} say={say} />
      )}
      {openCampaign && project && (
        <OperationCard key={openCampaign.id} campaign={openCampaign} project={project} cockpit={cockpit} regularFirst={!!open.regularFirst} taskKey={open.taskKey || null} teamOnly={!!open.teamOnly}
          onClose={() => { setOpen(null); load(); }} onBackToProject={() => { setOpen(null); load(); }} onGoFill={(section) => { setOpen(null); onGoFill?.(section); }} onChanged={load} />
      )}
      </div>
    </>
  );
}
