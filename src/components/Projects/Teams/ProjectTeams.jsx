import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import useProjectCockpit from '../../../lib/useProjectCockpit';
import { fetchCampaignControl } from '../../../lib/api/campaignControl';
import { deleteTeam, fetchTeamsData, setTeamRunning } from '../../../lib/api/teams';
import { useConfirm } from '../../common/ConfirmDialog';
import { TEAMS, teamRoles, teamsOf } from '../../../lib/agents/teams';
import { describeRegular, kyivToday, pausedBySeason, regularsOf, seasonOver } from '../../../lib/agents/operationCycles';
import { dayMonthOf } from '../../../lib/agents/scheduleCalendar';
import { removeRegular, setRegularEnabled } from '../../../lib/api/operationCycles';
import OperationCard from '../../../pages/Tools/cockpit/OperationCard';
import { fmtDateTime } from '../../../pages/Smm/agentUi';
import { HubTitle } from '../hubIcons';
import LaunchTeamWizard from './LaunchTeamWizard';
import TeamCard from './TeamCard';
import TeamTasks from './TeamTasks';
import { RoundBtn, TeamRing } from './teamsUi';
import OneOffDialog from './OneOffDialog';
import OneOffCreativeDialog from './OneOffCreativeDialog';
import '../../../styles/projectTeams.css';
import '../../../styles/projectTeamsPlum.css';

const STATE = { running: ['працює', 'is-ok'], paused: ['зупинено', 'is-wait'] };
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
  const [open, setOpen] = useState(null); // { campaignId, regularFirst }: the operation card (cycles of creatives, legacy operations)
  const [oneoff, setOneoff] = useState(false); // the dialog of a one-off task
  const [creativeTask, setCreativeTask] = useState(null); // the window of a one-off task of creatives: the campaign of the creative team
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
    // the main regular task rests while a season replaces it: said on the card of the team
    const rest = t.key === 'creative' ? regularsOf(t.campaign).filter((r) => r.enabled && !r.seasonal).map((r) => pausedBySeason(t.campaign, r)).filter(Boolean)[0] : null;
    if (rest && t.state === 'running') return ['агентів працює: за запитом', `основне завдання на паузі до ${dayMonthOf(rest.endDate)}: сезонне «${rest.title}»`];
    const on = (ctl?.agents || []).filter((a) => a.mode !== 'paused');
    const nextAt = on.map((a) => a.nextAt).filter(Boolean).sort()[0];
    const last = on.map((a) => a.lastRunAt).filter(Boolean).sort().pop();
    return [ctl ? (t.state === 'paused' ? (t.key === 'creative' ? 'команда на паузі: регулярні завдання не запускаються' : `агентів у команді: ${on.length}, команда на паузі`) : `агентів працює: ${on.length || (t.key === 'creative' ? 'за запитом' : 0)}`) : 'завантажуємо агентів…', [last ? `останній запуск ${fmtDateTime(last)}` : 'ще не запускались', nextAt ? `найближчий ${fmtDateTime(nextAt)}` : ''].filter(Boolean).join(' · ')];
  }

  // the agents of a team as a chain of pills: green = works, grey = paused
  const chainOf = (t) => {
    if (t.key === 'reports') return [{ id: 'rep', name: 'Агент звітів', on: t.state === 'running' }];
    const ctl = control[t.campaign.id];
    if (!ctl) return [];
    const roles = new Set(teamRoles(t.key, data?.accounts || []));
    return ctl.agents.filter((a) => roles.has(a.role)).map((a) => ({ id: a.id, name: a.name, on: a.mode !== 'paused' && t.state === 'running' }));
  };
  const nextRuns = runningTeams.filter((t) => t.state === 'running' && t.campaign).flatMap((t) => (control[t.campaign.id]?.agents || []).filter((a) => a.mode !== 'paused').map((a) => a.nextAt)).filter(Boolean).sort();
  const nRun = runningTeams.filter((t) => t.state === 'running').length;
  const nPause = runningTeams.filter((t) => t.state === 'paused').length;
  const newButtons = <div className="tmx-btns"><button type="button" className="btn" onClick={() => setOneoff(true)}>Додаткове завдання</button><button type="button" className="btn btn-p" onClick={() => setWizard(true)}>+ Запустити команду</button></div>;
  const lead = 'Команди, які працюють для цього клієнта. Усе, що вони читають, береться з розділу «Інформація про проєкт».';

  return (
    <>
      <div className="pcr-wrap tm tmx pw-dark" data-dd="night">
        <section className={'tmx-box' + (empty ? ' is-open' : '')} aria-label="Запуск AI команди">
          <div className="tmx-bh">
            <div><HubTitle icon="users">Запуск AI команди</HubTitle><p className="tmx-lead">{lead}</p></div>
            {view && newButtons}
          </div>
          {view && !empty && (
            <div className="tmx-sum">
              <div><b className="is-ok">{nRun}</b><small>{nRun === 1 ? 'команда працює' : 'команди працюють'}</small></div>
              <div><b className="is-wait">{nPause}</b><small>на паузі</small></div>
              <div><b>{nextRuns[0] ? fmtDateTime(nextRuns[0]) : '—'}</b><small>найближчий запуск агентів</small></div>
            </div>
          )}
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

        {!empty && view && (
          <div className="tmx-list">
            {runningTeams.map((t) => {
              const [line1, line2] = summary(t);
              const [label, tone] = STATE[t.state];
              const run = t.state === 'running';
              const chain = chainOf(t);
              return (
                <article key={t.key} className={'tmx-team is-' + t.state}>
                  <div className="tmx-row">
                    <div className="tmx-main">
                      <div className="tmx-t"><TeamRing name={t.key} size={32} /><b>{t.def.title}</b><span className={'pcr-state ' + tone}>{label}</span></div>
                      <small>{line1} · {line2}</small>
                    </div>
                    <div className="tmx-btns">
                      <button type="button" className="btn btn-p" onClick={() => (t.key === 'reports' ? onOpenReports?.() : t.key === 'analytics' ? setCard('analytics') : setOpen({ campaignId: t.campaign.id, regularFirst: false }))}>{t.key === 'reports' ? 'Налаштування й звіти' : 'Відкрити команду'}</button>
                      <RoundBtn icon={run ? 'pause' : 'play'} label={run ? 'Зупинити' : 'Продовжити'} disabled={busy === t.key} onClick={() => toggle(t)} />
                      <RoundBtn icon="trash" label="Видалити команду" disabled={busy === t.key} onClick={() => remove(t)} />
                    </div>
                  </div>
                  {chain.length > 0 && (
                    <div className="tmx-chain" aria-label="Агенти команди">
                      {chain.map((a, i) => <span key={a.id} className="tmx-chain-i"><span className={'tmx-a' + (a.on ? '' : ' is-off')}><i />{a.name}</span>{i < chain.length - 1 && <span className="tmx-ln" aria-hidden="true" />}</span>)}
                    </div>
                  )}
                  {t.key === 'creative' && t.campaign && (
                    <TeamTasks campaign={t.campaign} cockpit={cockpit.byId?.[t.campaign.id]} busy={busy} say={say} onSeasonAction={seasonAction}
                      onOpen={() => setOpen({ campaignId: t.campaign.id, regularFirst: false })} onNewRegular={() => setOpen({ campaignId: t.campaign.id, regularFirst: true })}
                      onNewSeasonal={() => setCreativeTask({ campaign: t.campaign, seasonal: true })} onNewOneoff={() => setCreativeTask({ campaign: t.campaign, seasonal: false })}
                      onChanged={() => Promise.all([load(), cockpit.reload?.()])} />
                  )}
                </article>
              );
            })}
            {view.legacy.map((l) => (
              <article key={'l' + l.campaign.id} className={'tmx-team tm-legacy is-' + l.state}>
                <div className="tmx-row">
                  <div className="tmx-main"><div className="tmx-t"><TeamRing name="users" size={32} /><b>{l.campaign.name}</b><span className="pcr-state is-wait">стара операція · {l.label}</span></div><small>Запущена за старою схемою: працює як працювала, відкрийте, щоб побачити роботу.</small></div>
                  <div className="tmx-btns"><button type="button" className="btn" onClick={() => setOpen({ campaignId: l.campaign.id, regularFirst: false })}>Відкрити</button></div>
                </div>
              </article>
            ))}
          </div>
        )}
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
        <OneOffDialog data={data} view={view} email={email} onClose={() => setOneoff(false)}
          onNewCreative={({ seasonal }) => { const c = view.teams.find((t) => t.key === 'creative')?.campaign; setOneoff(false); if (c) setCreativeTask({ campaign: c, seasonal: !!seasonal }); }}
          onNewRegular={() => { const c = view.teams.find((t) => t.key === 'creative')?.campaign; setOneoff(false); if (c) setOpen({ campaignId: c.id, regularFirst: true }); }}
          onOpenReports={() => { setOneoff(false); onOpenReports?.(); }} onOpenMaterials={() => { setOneoff(false); onOpenMaterials?.(); }}
          onGoFill={(section) => { setOneoff(false); onGoFill?.(section); }} />
      )}
      {creativeTask && data && (
        <OneOffCreativeDialog key={creativeTask.seasonal ? 's' : 'o'} data={data} campaign={creativeTask.campaign} seasonal={creativeTask.seasonal} email={email} onClose={() => setCreativeTask(null)}
          onCreated={(text) => { setCreativeTask(null); say(text); load(); cockpit.reload?.(); }} />
      )}
      {card && data && view?.teams.find((x) => x.key === card && x.campaign) && (
        <TeamCard key={card} team={view.teams.find((x) => x.key === card)} data={data}
          onClose={() => { setCard(null); load(); }} onChanged={() => { load(); cockpit.reload?.(); }}
          onGoFill={(section) => { setCard(null); onGoFill?.(section); }} say={say} />
      )}
      {openCampaign && project && (
        <OperationCard key={openCampaign.id} campaign={openCampaign} project={project} cockpit={cockpit} regularFirst={!!open.regularFirst}
          onClose={() => { setOpen(null); load(); }} onBackToProject={() => { setOpen(null); load(); }} onGoFill={(section) => { setOpen(null); onGoFill?.(section); }} onChanged={load} />
      )}
      </div>
    </>
  );
}
