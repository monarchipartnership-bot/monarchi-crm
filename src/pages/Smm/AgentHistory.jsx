import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { fetchRuns } from '../../lib/api/agents';
import { copyToClipboard } from '../../lib/clipboard';
import { fmtDateTime } from './agentUi';

function Block({ title, text, notify }) {
  return (
    <div className="smm-run-block">
      <div className="smm-run-block-head">
        <b>{title}</b>
        <button type="button" className="smm-link-btn" onClick={async () => { try { await copyToClipboard(text || ''); notify('Скопійовано.'); } catch { notify('Не вдалося скопіювати.', true); } }}><ActionIcon name="copy" size={16} /> Копіювати</button>
      </div>
      <pre>{text || '—'}</pre>
    </div>
  );
}

// The log of every model call of this agent: the EXACT system and user prompt that was sent, the answer, the cost.
export default function AgentHistory({ agent, notify }) {
  const [runs, setRuns] = useState(null);
  const [openId, setOpenId] = useState(null);
  useEffect(() => { fetchRuns(agent.id, 30).then(setRuns).catch(() => setRuns([])); }, [agent.id]);
  if (!runs) return <p className="smm-muted">Завантаження…</p>;
  if (!runs.length) return <p className="smm-empty smm-empty--big">Запитів до моделі ще не було. Тут зʼявиться кожен запит із точним текстом промту, який було надіслано.</p>;
  return (
    <>
      <p className="smm-muted">Останні {runs.length} запитів до моделі. Розгорніть запит, щоб побачити, що саме було надіслано (промт агента + закриті правила + дані завдання) і що відповіла модель.</p>
      <ul className="smm-runs">
        {runs.map((r) => (
          <li key={r.id} className={'smm-run' + (r.status === 'error' ? ' is-error' : '')}>
            <button type="button" className="smm-run-head" aria-expanded={openId === r.id} onClick={() => setOpenId(openId === r.id ? null : r.id)}>
              <span className="smm-run-when">{fmtDateTime(r.created_at)}</span>
              <span className="smm-run-what">Завдання #{r.task_id ?? '—'}{r.prompt_version ? ` · промт v${r.prompt_version}` : ''}</span>
              <span className="smm-run-nums">{r.status === 'error' ? 'помилка' : `${(r.input_tokens || 0) + (r.output_tokens || 0)} токенів · $${Number(r.cost_usd || 0).toFixed(3)} · ${Math.round((r.duration_ms || 0) / 1000)} с`}</span>
            </button>
            {openId === r.id && (
              <div className="smm-run-body">
                {r.error && <p className="smm-error">{r.error}</p>}
                <Block title="Системний промт (інструкція + закриті правила)" text={r.system_prompt} notify={notify} />
                <Block title="Запит із даними завдання" text={r.user_prompt} notify={notify} />
                <Block title="Відповідь моделі" text={r.response} notify={notify} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
