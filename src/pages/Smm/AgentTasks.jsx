import { useState } from 'react';
import { agentAction } from '../../lib/api/agents';
import { NETWORKS } from '../../lib/api/smm';
import { fmtDateTime, TASK_STATUS, TASK_TYPE } from './agentUi';

// The tasks of one agent: who asked, for which post, with which prompt version, what came out. A failed task can be retried,
// a waiting one cancelled.
export default function AgentTasks({ agent, team, tasks, posts, reload, notify, kick }) {
  const [busyId, setBusyId] = useState(null);
  const postById = new Map(posts.map((p) => [p.id, p]));
  const agentName = (id) => team.agents.find((a) => a.id === id)?.name;

  async function act(task, action) {
    setBusyId(task.id);
    try {
      await agentAction(action, { taskId: task.id });
      notify(action === 'retry_task' ? 'Завдання поставлено в чергу знову.' : 'Завдання скасовано.');
      await reload();
      if (action === 'retry_task') kick();
    } catch (e) { notify(e.message || 'Не вдалося виконати.', true); } finally { setBusyId(null); }
  }

  if (!tasks.length) return <p className="smm-empty smm-empty--big">Завдань ще не було. Вони зʼявляться, коли агент отримає їх від іншого агента, за розкладом або після запуску вручну.</p>;
  return (
    <ul className="smm-tasks">
      {tasks.map((t) => {
        const [label, tone] = TASK_STATUS[t.status] || [t.status, 'off'];
        const post = t.post_id ? postById.get(t.post_id) : null;
        const from = t.created_by_agent_id ? agentName(t.created_by_agent_id) : t.created_by;
        return (
          <li key={t.id} className={'smm-task smm-task--' + tone}>
            <div className="smm-task-main">
              <span className="smm-task-type">{TASK_TYPE[t.type] || t.type}</span>
              <span className={'smm-state smm-state--' + tone}>{label}</span>
              {t.attempt > 1 && <span className="smm-pill">спроба {t.attempt}</span>}
            </div>
            <p className="smm-task-line">
              {post ? <>Пост: {NETWORKS[post.platform]?.label} · {post.topic || 'без теми'}</> : t.post_id ? 'Пост видалено' : 'Без привʼязки до поста'}
              {from ? ` · від: ${from}` : ''}{t.brief?.feedback?.length ? ` · доопрацювання за зауваженнями (${t.brief.feedback.length})` : ''}
            </p>
            <p className="smm-task-line smm-muted">
              {fmtDateTime(t.created_at)}{t.prompt_version ? ` · промт v${t.prompt_version}` : ''}{Number(t.cost_usd) ? ` · $${Number(t.cost_usd).toFixed(3)}` : ''}
              {t.output?.rework ? ' · друга версія' : ''}
            </p>
            {t.error && <p className="smm-error">{t.error}</p>}
            {t.status === 'done' && t.output?.verdict && <p className="smm-task-line">Висновок: {t.output.verdict === 'pass' ? 'пройшов' : 'повернуто на доопрацювання'}{t.output.issues ? `, зауважень: ${t.output.issues}` : ''}</p>}
            <div className="smm-task-actions">
              {(t.status === 'failed' || t.status === 'cancelled') && <button type="button" className="smm-btn" disabled={busyId === t.id} onClick={() => act(t, 'retry_task')}>Повторити</button>}
              {t.status === 'queued' && <button type="button" className="smm-btn" disabled={busyId === t.id} onClick={() => act(t, 'cancel_task')}>Скасувати</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
