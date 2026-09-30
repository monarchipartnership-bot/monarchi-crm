import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { routeTask } from '../../lib/api/taskOrchestratorApi';
import '../../styles/taskOrchestratorPage.css';

const AGENT_KEY = 'task-orchestrator';

// Ninth real agent, fifth and last Wave 1 slot's neighbor (task-
// orchestrator is Wave 1's own last queue item, see docs/ai-agents-
// roadmap.md §4.9) — a router over the AI Agents roster itself. Unlike
// every other agent, its system prompt is generated from the live
// AGENT_DEPTS data (see taskOrchestratorPrompt.js's buildAgentRosterBlock)
// rather than hand-written, so it never drifts out of sync with which
// agents actually exist as new ones get added — including this one, once
// it ships. Same "no client_id yet" shape as the other manual/standalone
// tools — not wired into the activity feed.
export default function TaskOrchestrator({ onClose }) {
  const [taskDescription, setTaskDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  async function handleRoute() {
    if (!taskDescription.trim()) {
      setStatus({ text: 'Опиши задачу перед розподілом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const routed = await routeTask({ taskDescription });
      setResult(routed);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка розподілу задачі. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="to-body">
        <div className="to-field to-field-grow">
          <label className="to-label">Опис задачі</label>
          <textarea
            className="to-textarea" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="Опиши складну задачу — координатор розкладе її на кроки й підбере агентів з реєстру…"
          />
        </div>

        <div className="to-actions">
          <button type="button" className="to-run-btn" onClick={handleRoute} disabled={loading}>
            {loading ? 'Розподіляю…' : 'Розподілити задачу'}
          </button>
          {status.text && <span className={'to-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="to-result">
            {result.steps.length > 0 && (
              <div className="to-steps">
                {result.steps.map((s, i) => (
                  <div key={i} className="to-step">
                    <span className="to-step-num">{i + 1}</span>
                    <div className="to-step-body">
                      <span className="to-step-task">{s.task}</span>
                      <span className="to-step-agent">→ {s.agent}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="to-summary">{result.summary}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
