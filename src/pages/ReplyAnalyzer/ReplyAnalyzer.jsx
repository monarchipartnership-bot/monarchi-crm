import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { analyzeReply } from '../../lib/api/replyAnalyzerApi';
import '../../styles/replyAnalyzerPage.css';

const AGENT_KEY = 'reply-analyzer';

const TYPE_LABEL = {
  'ЗАЦІКАВЛЕНІСТЬ': 'Зацікавленість', 'ПОТРІБНО БІЛЬШЕ ІНФОРМАЦІЇ': 'Потрібно більше інформації',
  'ЗАПЕРЕЧЕННЯ': 'Заперечення', 'НЕ АКТУАЛЬНО': 'Не актуально', 'НЕЙТРАЛЬНО': 'Нейтрально',
};
const TYPE_CLASS = {
  'ЗАЦІКАВЛЕНІСТЬ': 'ok', 'ПОТРІБНО БІЛЬШЕ ІНФОРМАЦІЇ': 'info',
  'ЗАПЕРЕЧЕННЯ': 'warn', 'НЕ АКТУАЛЬНО': 'bad', 'НЕЙТРАЛЬНО': 'muted',
};

// Fourteenth real agent, second of Wave 3 in the locked build queue
// (docs/ai-agents-roadmap.md §4.9). Standalone paste-text tool, same
// shape as job-post-analyzer — classifies an inbound client reply and
// suggests one concrete next step. Same "no client_id yet" reasoning —
// not wired into the activity feed.
export default function ReplyAnalyzer({ onClose }) {
  const [clientReply, setClientReply] = useState('');
  const [ourPreviousMessage, setOurPreviousMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  async function handleAnalyze() {
    if (!clientReply.trim()) {
      setStatus({ text: 'Встав відповідь клієнта перед аналізом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const analyzed = await analyzeReply({ clientReply, ourPreviousMessage });
      setResult(analyzed);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка аналізу. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="ra-body">
        <div className="ra-field ra-field-grow">
          <label className="ra-label">Відповідь клієнта</label>
          <textarea className="ra-textarea ra-textarea-main" value={clientReply} onChange={(e) => setClientReply(e.target.value)} placeholder="Встав текст відповіді клієнта…" />
        </div>

        <div className="ra-field">
          <label className="ra-label">Наше попереднє повідомлення (необов&apos;язково)</label>
          <textarea className="ra-textarea ra-textarea-small" value={ourPreviousMessage} onChange={(e) => setOurPreviousMessage(e.target.value)} placeholder="На що саме відповідає клієнт…" />
        </div>

        <div className="ra-actions">
          <button type="button" className="ra-run-btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Аналізую…' : 'Проаналізувати відповідь'}
          </button>
          {status.text && <span className={'ra-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="ra-result">
            {result.replyType && TYPE_LABEL[result.replyType] && (
              <span className={'ra-type ra-type--' + TYPE_CLASS[result.replyType]}>{TYPE_LABEL[result.replyType]}</span>
            )}
            {result.objection && result.objection.toLowerCase() !== 'немає' && (
              <p className="ra-objection">Заперечення: {result.objection}</p>
            )}
            <p className="ra-next-step">{result.nextStep}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
