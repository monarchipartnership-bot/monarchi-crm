import { useMemo } from 'react';
import { teamTasksOf } from '../../../lib/agents/teamTasks';
import { renameRegular, renameRequest } from '../../../lib/api/operationCycles';
import InlineName from './InlineName';
import './teamTasks.css';

const STATE_CLASS = { work: 'is-ok', wait: 'is-wait', paused: 'is-wait', soon: 'is-wait' };

// «Завдання команди» (owner, 2026-11-12): what the creative team works on, each with its own name that the person chooses and a mark (main regular, additional regular, seasonal, one-off).
// A click on «Відкрити» opens the window of the team. The buttons below add a task of any kind.
//   campaign: the ag_campaigns row   cockpit: its cabinet   busy: the id of the task being changed
//   onOpen(task): the card of THAT task (step 3.0b)  onNewRegular()  onNewSeasonal()  onNewOneoff()  onSeasonAction(regular, 'stop' | 'resume' | 'remove')  onChanged(): the lists are read again   say(text, bad)
export default function TeamTasks({ campaign, cockpit, busy = '', onOpen, onNewRegular, onNewSeasonal, onNewOneoff, onSeasonAction, onChanged, say }) {
  const tasks = useMemo(() => teamTasksOf({ campaign, cockpit }), [campaign, cockpit]);
  async function rename(task, name) {
    if (task.regularId) await renameRegular(campaign.id, task.regularId, name);
    else await renameRequest(task.requestId, name);
    say?.(`Завдання названо «${name}».`);
    await onChanged?.();
  }
  return (
    <div className="tt" aria-label="Завдання команди">
      <div className="tt-h"><span>Завдання команди</span><span className="tt-n">{tasks.length}</span></div>
      {!tasks.length && <p className="tt-empty">Завдань ще немає: додайте регулярне, сезонне або разове.</p>}
      <ul className="tt-list">
        {tasks.map((t) => (
          <li key={t.key} className="tt-row">
            <span className={'tt-kind is-' + t.kind}>{t.kindLabel}</span>
            <div className="tt-main">
              <InlineName value={t.title} fallback="Без назви" label={`Назва завдання «${t.title}»`} allowEmpty={false} onSave={(name) => rename(t, name)} />
              {t.line && <small>{t.line}</small>}
            </div>
            <span className={'pcr-state ' + (STATE_CLASS[t.state] || '')}>{t.stateText}</span>
            <div className="tt-acts">
              <button type="button" className="btn tmx-sm" onClick={() => onOpen?.(t)}>Відкрити</button>
              {t.kind === 'seasonal' && (
                <>
                  <button type="button" className="btn tmx-sm" disabled={busy === 'season:' + t.regularId} onClick={() => onSeasonAction({ id: t.regularId, title: t.title, enabled: t.enabled }, t.enabled ? 'stop' : 'resume')}>{t.enabled ? 'Зупинити' : 'Продовжити'}</button>
                  <button type="button" className="btn tmx-sm" disabled={busy === 'season:' + t.regularId} onClick={() => onSeasonAction({ id: t.regularId, title: t.title, enabled: t.enabled }, 'remove')}>Видалити</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="tt-add">
        <button type="button" className="tt-addb" onClick={onNewRegular}>+ Регулярне завдання</button>
        <button type="button" className="tt-addb" onClick={onNewSeasonal}>+ Сезонне</button>
        <button type="button" className="tt-addb" onClick={onNewOneoff}>+ Разове</button>
      </div>
    </div>
  );
}
