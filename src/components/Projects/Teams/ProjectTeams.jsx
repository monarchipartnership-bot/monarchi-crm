import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import useProjectCockpit from '../../../lib/useProjectCockpit';
import { fetchCampaignControl } from '../../../lib/api/campaignControl';
import { deleteTeam, fetchTeamsData, setTeamRunning } from '../../../lib/api/teams';
import { useConfirm } from '../../common/ConfirmDialog';
import { teamsOf } from '../../../lib/agents/teams';
import OperationCard from '../../../pages/Tools/cockpit/OperationCard';
import { fmtDateTime } from '../../../pages/Smm/agentUi';
import { HubTitle } from '../hubIcons';
import LaunchTeamWizard from './LaunchTeamWizard';
import TeamCard from './TeamCard';
import '../../../styles/projectTeams.css';

const STATE = { running: ['працює', 'is-ok'], paused: ['зупинено', 'is-wait'] };
const WEEKDAYS = ['понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота', 'неділя'];

// «Запуск AI команди» of the card of the project (owner, 2026-11-11): the teams that work for the client (creatives, analytics, reports), the launch of a new one
// (choose → check what is filled → settings of the agents → summary and price) and the control of the running ones. Everything the teams read is in the card of the project.
//   projectId  onGoFill(section): opens that section of «Інформація про проєкт»   onOpenReports(): opens the tab of the report agent
export default function ProjectTeams({ projectId, onGoFill, onOpenReports }) {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const cockpit = useProjectCockpit({ enabled: true });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [open, setOpen] = useState(null); // { campaignId, regularFirst }: the operation card (cycles of creatives, legacy operations)
  const [card, setCard] = useState(null); // the key of the team whose card (agents, schedules, money) is open
  const [control, setControl] = useState({}); // campaign id -> the agents with their last and next runs
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const say = useCallback((text, bad = false) => { setNote({ text, bad }); setTimeout(() => setNote(null), bad ? 8000 : 4500); }, []);

  const load = useCallback(async () => {
    try { setData(await fetchTeamsData(projectId)); setError(''); } catch (e) { setError(e?.message || 'Не вдалося завантажити команди.'); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => (data ? teamsOf({ campaigns: data.campaigns, agent: data.agent }) : null), [data]);
  // the last and the next run of the agents of every running team
  useEffect(() => {
    if (!view) return;
    const ids = [...view.teams.filter((t) => t.campaign).map((t) => t.campaign.id), ...view.legacy.map((l) => l.campaign.id)];
    ids.forEach((id) => { fetchCampaignControl(id).then((c) => setControl((m) => ({ ...m, [id]: c }))).catch(() => {}); });
  }, [view]);

  async function toggle(team) {
    setBusy(team.key);
    try { await setTeamRunning(team, team.state !== 'running', email); say(team.state === 'running' ? `Команду «${team.def.title}» зупинено: агенти не запускаються, поки ви її не продовжите.` : `Команду «${team.def.title}» продовжено.`); await Promise.all([load(), cockpit.reload?.()]); } catch (e) { say(e?.message || 'Не вдалося змінити команду.', true); } finally { setBusy(''); }
  }

  const GONE = {
    creative: 'Будуть видалені всі цикли, запити й креативи цієї команди, а також її налаштування. Відновити їх не можна.',
    analytics: 'Будуть видалені агенти команди, їхні звіти, плани дій і історія витрат. Відновити їх не можна.',
    reports: 'Агента звітів буде відключено від проєкту: розклад і налаштування зникнуть. Звіти, які вже є в «Історії проєкту», залишаться.',
  };
  async function remove(team) {
    if (!(await confirm({ title: `Видалити команду «${team.def.title}»?`, body: GONE[team.key], confirmLabel: 'Видалити команду' }))) return;
    setBusy(team.key);
    try { await deleteTeam(team, email); say(`Команду «${team.def.title}» видалено.`); await Promise.all([load(), cockpit.reload?.()]); } catch (e) { say(e?.message || 'Не вдалося видалити команду.', true); } finally { setBusy(''); }
  }

  const runningTeams = view ? view.teams.filter((t) => t.state !== 'none') : [];
  const empty = view && !runningTeams.length && !view.legacy.length;
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
    const on = (ctl?.agents || []).filter((a) => a.mode !== 'paused');
    const nextAt = on.map((a) => a.nextAt).filter(Boolean).sort()[0];
    const last = on.map((a) => a.lastRunAt).filter(Boolean).sort().pop();
    return [ctl ? (t.state === 'paused' ? `агентів у команді: ${on.length}, команда на паузі` : `агентів працює: ${on.length || (t.key === 'creative' ? 'за запитом' : 0)}`) : 'завантажуємо агентів…', [last ? `останній запуск ${fmtDateTime(last)}` : 'ще не запускались', nextAt ? `найближчий ${fmtDateTime(nextAt)}` : ''].filter(Boolean).join(' · ')];
  }

  return (
    <div className="pcr-wrap tm">
      {confirmDialog}
      <section className="pcr-card" aria-label="Запуск AI команди">
        <div className="pcr-head">
          <div>
            <HubTitle icon="users">Запуск AI команди</HubTitle>
            <p className="pcr-sub">Команди, які працюють для цього клієнта. Усе, що вони читають, береться з розділу «Інформація про проєкт».</p>
          </div>
        </div>
        {note && <p className={'tm-note' + (note.bad ? ' is-bad' : '')} role="status">{note.text}</p>}
        {error && <p className="pcr-error" role="alert">{error}</p>}
        {!view && !error && <div className="pcr-empty">Завантаження…</div>}

        {empty && (
          <div className="tm-empty">
            <b>На даний момент AI команди не запущені</b>
            <p>Оберіть, що потрібно для клієнта: креативи, аналітику кабінетів або звіти. Перед запуском система перевірить, чи все заповнено, і покаже, що ще треба додати.</p>
            <button type="button" className="btn btn-p" onClick={() => setWizard(true)}>Запустити команду</button>
          </div>
        )}

        <div className="tm-list">
          {runningTeams.map((t) => {
            const [line1, line2] = summary(t);
            const [label, tone] = STATE[t.state];
            return (
              <article key={t.key} className={'tm-team is-' + t.state}>
                <div className="tm-team-main">
                  <div className="tm-team-title"><b>{t.def.title}</b><span className={'pcr-state ' + tone}>{label}</span></div>
                  <small>{line1}</small><small>{line2}</small>
                </div>
                <div className="tm-team-acts">
                  <button type="button" className="btn" onClick={() => (t.key === 'reports' ? onOpenReports?.() : t.key === 'analytics' ? setCard('analytics') : setOpen({ campaignId: t.campaign.id, regularFirst: false }))}>{t.key === 'reports' ? 'Налаштування й звіти' : 'Відкрити команду'}</button>
                  <button type="button" className="btn" disabled={busy === t.key} onClick={() => toggle(t)}>{t.state === 'running' ? 'Зупинити' : 'Продовжити'}</button>
                  <button type="button" className="btn" disabled={busy === t.key} onClick={() => remove(t)}>Видалити команду</button>
                </div>
              </article>
            );
          })}
          {view?.legacy.map((l) => (
            <article key={'l' + l.campaign.id} className={'tm-team tm-legacy is-' + l.state}>
              <div className="tm-team-main"><b>{l.campaign.name}</b><span className="pcr-state is-wait">стара операція · {l.label}</span><small>Запущена за старою схемою: працює як працювала, відкрийте, щоб побачити роботу.</small></div>
              <div className="tm-team-acts"><button type="button" className="btn" onClick={() => setOpen({ campaignId: l.campaign.id, regularFirst: false })}>Відкрити</button></div>
            </article>
          ))}
          {!empty && view && <div className="tm-add"><button type="button" className="btn btn-p" onClick={() => setWizard(true)}>+ Запустити команду</button></div>}
        </div>
      </section>

      {wizard && data && (
        <LaunchTeamWizard data={data} reload={load} email={email}
          onGoFill={(section) => { setWizard(false); onGoFill?.(section); }}
          onClose={() => setWizard(false)}
          onLaunched={async (launched) => {
            setWizard(false); await Promise.all([load(), cockpit.reload?.()]);
            say(`Запущено: ${launched.map((x) => x.title).join(', ')}.`);
            const c = launched.find((x) => x.campaignId && x.key === 'creative');
            if (c) setOpen({ campaignId: c.campaignId, regularFirst: true }); // the creatives work by cycles: the form of the regular cycle opens at once
          }} />
      )}
      {card && data && view?.teams.find((x) => x.key === card && x.campaign) && (
        <TeamCard key={card} team={view.teams.find((x) => x.key === card)} data={data}
          onClose={() => { setCard(null); load(); }} onChanged={() => { load(); cockpit.reload?.(); }}
          onGoFill={(section) => { setCard(null); onGoFill?.(section); }} say={say} />
      )}
      {openCampaign && project && (
        <OperationCard key={openCampaign.id} campaign={openCampaign} project={project} cockpit={cockpit} regularFirst={!!open.regularFirst}
          onClose={() => { setOpen(null); load(); }} onChanged={load} />
      )}
    </div>
  );
}
