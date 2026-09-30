import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { reviewOutput } from '../../lib/api/qualityControllerApi';
import '../../styles/qualityControllerPage.css';

const AGENT_KEY = 'ai-quality-controller';

const VERDICT_LABEL = { 'ГОТОВО': 'Готово до відправки', 'ПОТРЕБУЄ ПРАВОК': 'Потребує правок', 'КРИТИЧНО': 'Критично — не відправляти' };
const VERDICT_CLASS = { 'ГОТОВО': 'ok', 'ПОТРЕБУЄ ПРАВОК': 'warn', 'КРИТИЧНО': 'bad' };

// Eighth real agent, third of the locked build queue (docs/ai-agents-
// roadmap.md §4.9) — an independent second opinion on any AI-generated
// output (cover letter, follow-up, sales brief) before a human sends it.
// Reuses CORE_WRITING_RULES_BLOCK from followupPrompt.js directly as the
// review checklist — the same bar every other text-generating agent is
// supposed to meet, not a second invented standard. Same "no client_id
// yet" shape as the other manual/standalone tools — not wired into the
// activity feed.
export default function QualityController({ onClose }) {
  const [outputToReview, setOutputToReview] = useState('');
  const [originalContext, setOriginalContext] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  async function handleReview() {
    if (!outputToReview.trim()) {
      setStatus({ text: 'Встав текст, який агент має перевірити.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const reviewed = await reviewOutput({ outputToReview, originalContext });
      setResult(reviewed);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка перевірки. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="qc-body">
        <div className="qc-field qc-field-grow">
          <label className="qc-label">Текст на перевірку (лист, follow-up, brief тощо)</label>
          <textarea
            className="qc-textarea qc-textarea-main" value={outputToReview} onChange={(e) => setOutputToReview(e.target.value)}
            placeholder="Встав текст, згенерований іншим AI-агентом…"
          />
        </div>

        <div className="qc-field">
          <label className="qc-label">Оригінальний контекст/задача (необов&apos;язково)</label>
          <textarea
            className="qc-textarea qc-textarea-context" value={originalContext} onChange={(e) => setOriginalContext(e.target.value)}
            placeholder="Job post, діалог з клієнтом чи інша задача, під яку це було згенеровано — для перевірки на галюцинації"
          />
        </div>

        <div className="qc-actions">
          <button type="button" className="qc-run-btn" onClick={handleReview} disabled={loading}>
            {loading ? 'Перевіряю…' : 'Перевірити'}
          </button>
          {status.text && <span className={'qc-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="qc-result">
            {result.verdict && VERDICT_LABEL[result.verdict] && (
              <span className={'qc-verdict qc-verdict--' + VERDICT_CLASS[result.verdict]}>{VERDICT_LABEL[result.verdict]}</span>
            )}
            {result.issues && (
              <div className="qc-issues">
                <span className="qc-issues-title">Знайдені проблеми</span>
                <p className="qc-issues-text">{result.issues}</p>
              </div>
            )}
            <p className="qc-summary">{result.summary}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
