import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { briefChiefOfStaff } from '../../lib/api/chiefOfStaffApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/chiefOfStaffPage.css';

const AGENT_KEY = 'ai-chief-of-staff';

// Twentieth and final agent in the locked build queue (docs/ai-agents-
// roadmap.md §4.9, item 18) — built last on purpose, since it benefits
// most from the fullest possible roster underneath it. Distinct from
// task-orchestrator (which only plans steps→agents): this one takes
// outputs the manager already gathered from individual agents/
// departments and synthesizes them into one leadership-level answer.
// Reuses the same live-roster pattern as task-orchestrator so agent
// references never drift from what's actually built.
export default function ChiefOfStaff({ onClose }) {
  const [leadershipRequest, setLeadershipRequest] = useState('');
  const [gatheredOutputs, setGatheredOutputs] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати документ');

  async function handleBrief() {
    if (!leadershipRequest.trim()) {
      setStatus({ text: 'Опиши запит від керівництва перед аналізом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const briefed = await briefChiefOfStaff({ leadershipRequest, gatheredOutputs });
      setResult(briefed);
      setCopyLabel('Скопіювати документ');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка аналізу. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await copyToClipboard(result);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати документ'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="cos-body">
        <div className="cos-field">
          <label className="cos-label">Запит від керівництва</label>
          <textarea
            className="cos-textarea cos-textarea-small" value={leadershipRequest} onChange={(e) => setLeadershipRequest(e.target.value)}
            placeholder="Складне питання чи задача, яка стосується кількох відділів…"
          />
        </div>

        <div className="cos-field cos-field-grow">
          <label className="cos-label">Результати, вже зібрані від агентів/відділів (необов&apos;язково)</label>
          <textarea
            className="cos-textarea cos-textarea-main" value={gatheredOutputs} onChange={(e) => setGatheredOutputs(e.target.value)}
            placeholder="Встав, що вже видали інші агенти (Маркетинговий стратег, Аналітик рекламних даних тощо) по цьому запиту…"
          />
        </div>

        <div className="cos-actions">
          <button type="button" className="cos-run-btn" onClick={handleBrief} disabled={loading}>
            {loading ? 'Збираю результат…' : 'Зібрати єдиний результат'}
          </button>
          {status.text && <span className={'cos-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="cos-result">
            <div className="cos-result-head">
              <span className="cos-result-title">Брифінг для керівництва</span>
              <button type="button" className="cos-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="cos-result-text">{result}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
