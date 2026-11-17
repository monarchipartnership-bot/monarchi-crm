import TaskCard from './TaskCard';
import TeamPrep from './TeamPrep';
import { RoundBtn, TaskIcon, TeamRing, TypeMedal } from './teamsUi';

// The working part of «Запуск AI команди» (owner's picks 2026-11-16, decision 51): above everything the block «Потребує вашого рішення», under it one column per launched team
// with its tasks as cards. Pure view: ProjectTeams passes the teams and the tasks already prepared.
//   teams: [{ key, title, stateLabel, tone, running, line, prep, settingsLabel, onSettings, onToggle, onRemove, busy, tasks: [task of TaskCard] }]
export default function TeamsBoard({ teams }) {
  const ask = teams.flatMap((t) => t.tasks.filter((x) => x.status === 'ask').map((x) => ({ ...x, team: t.title })));
  const n = Math.min(3, teams.length);
  return (
    <>
      {ask.length > 0 && (
        <section className="tb-att" aria-label="Потребує вашого рішення">
          <h4><TaskIcon name="alert" />Потребує вашого рішення <em>{ask.length}</em></h4>
          <ul>
            {ask.map((x) => (
              <li key={x.key}>
                <div className="tb-att-top"><TypeMedal type={x.type} size={26} /><small>{x.team}</small></div>
                <b>{x.title}</b>
                <small>{x.hint || x.line}</small>
                <button type="button" className="btn tmx-sm tb-gold" onClick={x.onOpen}>{x.cta || 'Переглянути'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={'tb-cols n' + n}>
        {teams.map((t) => (
          <section key={t.key} className={'tb-col is-' + (t.running ? 'running' : 'paused')} aria-label={t.title}>
            <div className="tb-th">
              <div className="tb-tt">
                <TeamRing name={t.key} size={34} />
                <div className="tb-tn"><b>{t.title}</b><span className={'pcr-state ' + t.tone}>{t.stateLabel}</span></div>
              </div>
              <div className="tmx-btns">
                <button type="button" className="btn tmx-sm" onClick={t.onSettings}>{t.settingsLabel}</button>
                <RoundBtn icon={t.running ? 'pause' : 'play'} label={t.running ? 'Зупинити команду' : 'Продовжити команду'} disabled={t.busy} onClick={t.onToggle} />
                <RoundBtn icon="trash" label="Видалити команду" disabled={t.busy} onClick={t.onRemove} />
              </div>
            </div>
            {t.line && <small className="tb-line">{t.line}</small>}
            {t.prep}
            {t.tasks.length ? <ul className="tb-list">{t.tasks.map((x) => <TaskCard key={x.key} task={x} />)}</ul> : <p className="tb-none">Завдань ще немає. Додайте їх кнопкою «+ Нове завдання».</p>}
          </section>
        ))}
      </div>
    </>
  );
}
