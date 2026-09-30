import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { buildOptimizationPlan } from '../../lib/api/googleOptimizationApi';
import '../../styles/googleOptimizationPage.css';

const AGENT_KEY = 'google-optimization-agent';

const PRIORITY_LABEL = { HIGH: 'Високий', MEDIUM: 'Середній', LOW: 'Низький' };

// Tenth real agent, first of Wave 2 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). Deliberately does NOT call the Google Ads
// API itself — that's ads-insights-analyst's job, already built and
// proven. This agent's own value is turning an EXISTING diagnosis
// (pasted from Ads Insights Analyst's chat/audit output, or any other
// source) into a concrete, prioritized action plan — a standalone
// text-processing step, same shape as Quality Controller/Case Selector.
// Same "no client_id yet" reasoning — not wired into the activity feed.
export default function GoogleOptimizationAgent({ onClose }) {
  const [diagnosis, setDiagnosis] = useState('');
  const [accountContext, setAccountContext] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  async function handleBuildPlan() {
    if (!diagnosis.trim()) {
      setStatus({ text: 'Встав діагноз стану кабінету перед побудовою плану.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const plan = await buildOptimizationPlan({ diagnosis, accountContext });
      setResult(plan);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка побудови плану. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="goa-body">
        <div className="goa-field goa-field-grow">
          <label className="goa-label">Діагноз стану Google Ads кабінету</label>
          <textarea
            className="goa-textarea goa-textarea-main" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="Встав діагноз — напр. скопійований з відповіді Аналітика рекламних даних та інсайтів…"
          />
        </div>

        <div className="goa-field">
          <label className="goa-label">Контекст про акаунт/бізнес (необов&apos;язково)</label>
          <textarea
            className="goa-textarea goa-textarea-context" value={accountContext} onChange={(e) => setAccountContext(e.target.value)}
            placeholder="Бюджетні обмеження, цілі, що вже пробували…"
          />
        </div>

        <div className="goa-actions">
          <button type="button" className="goa-run-btn" onClick={handleBuildPlan} disabled={loading}>
            {loading ? 'Будую план…' : 'Побудувати план оптимізації'}
          </button>
          {status.text && <span className={'goa-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="goa-result">
            {result.actions.length > 0 && (
              <div className="goa-actions-list">
                {result.actions.map((a, i) => (
                  <div key={i} className="goa-action">
                    <div className="goa-action-head">
                      <span className="goa-action-num">{i + 1}</span>
                      {a.priority && PRIORITY_LABEL[a.priority] && (
                        <span className={'goa-priority goa-priority--' + a.priority.toLowerCase()}>{PRIORITY_LABEL[a.priority]}</span>
                      )}
                    </div>
                    <span className="goa-action-text">{a.action}</span>
                    <span className="goa-action-effect">Ефект: {a.effect}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="goa-summary">{result.summary}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
