import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { analyzeJobPost } from '../../lib/api/jobPostAnalyzerApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/jobPostAnalyzerPage.css';

const AGENT_KEY = 'job-post-analyzer';

const PRIORITY_LABEL = { HIGH: 'Високий пріоритет', MEDIUM: 'Середній пріоритет', LOW: 'Низький пріоритет' };

function briefAsText(result) {
  return [
    `Ніша: ${result.niche || '—'}`,
    `Суть задачі: ${result.essence || '—'}`,
    `Потрібні послуги: ${result.services || '—'}`,
    `Бюджет/терміни: ${result.budget || '—'}`,
    `Червоні прапорці: ${result.flags || '—'}`,
    `Пріоритет: ${result.priority || '—'}`,
    '',
    result.summary,
  ].join('\n');
}

// Compact version of the brief for handing off into another agent's
// "extraContext" field (see onHandoff below) — the target agent doesn't
// need the summary paragraph, just the structured hints.
function briefAsExtraContext(result) {
  return [
    'Аналіз job post (від Агента аналізу оголошень):',
    `Ніша: ${result.niche || '—'}`,
    `Потрібні послуги: ${result.services || '—'}`,
    `Бюджет/терміни: ${result.budget || '—'}`,
    `Червоні прапорці: ${result.flags || '—'}`,
  ].join('\n');
}

// Fourth real agent — reads a pasted job post / inbound message and
// produces a structured sales brief for the manager deciding whether and
// how to respond. Purely an internal-facing extraction task (not
// client-facing prose), so it does NOT reuse the CORE+STYLE writing-rules
// architecture Cover Letter/Follow-up share — see jobPostAnalyzerPrompt.js.
// Same "no client_id yet" shape as Cover Letter Agent: not wired into the
// activity feed, for the same reason.
//
// `onHandoff` (optional, passed by ConstellationTest for every agent tool
// — see handoffToAgentTool there) opens another agent tool pre-filled
// with this one's output — first real use of §4.5's event-triggered
// handoff concept: job-post-analyzer (foundation stage) → cover-letter-
// agent (generate stage) is exactly the Foundation→Generate pipeline the
// roadmap describes as not real yet.
export default function JobPostAnalyzer({ onClose, onHandoff }) {
  const [jobPost, setJobPost] = useState('');
  const [extraContext, setExtraContext] = useState('');

  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати brief');

  async function handleAnalyze() {
    if (!jobPost.trim()) {
      setStatus({ text: 'Встав текст job post перед аналізом.', error: true });
      return;
    }
    setAnalyzing(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const analyzed = await analyzeJobPost({ jobPost, extraContext });
      setResult(analyzed);
      setCopyLabel('Скопіювати brief');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка аналізу. Спробуй ще раз.', error: true });
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await copyToClipboard(briefAsText(result));
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати brief'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="jpa-body">
        <div className="jpa-field jpa-field-grow">
          <label className="jpa-label">Job post або inbound-звернення клієнта</label>
          <textarea className="jpa-textarea jpa-textarea-job" value={jobPost} onChange={(e) => setJobPost(e.target.value)} placeholder="Встав текст вакансії чи звернення клієнта…" />
        </div>

        <div className="jpa-field">
          <label className="jpa-label">Додатковий контекст (необов&apos;язково)</label>
          <textarea className="jpa-textarea jpa-textarea-context" value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="Будь-які деталі, які варто врахувати…" />
        </div>

        <div className="jpa-actions">
          <button type="button" className="jpa-analyze-btn" onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? 'Аналізую…' : 'Проаналізувати'}
          </button>
          {status.text && <span className={'jpa-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="jpa-result">
            <div className="jpa-result-head">
              <span className="jpa-result-title">Sales brief</span>
              <div className="jpa-result-head-actions">
                {result.priority && PRIORITY_LABEL[result.priority] && (
                  <span className={'jpa-priority jpa-priority--' + result.priority.toLowerCase()}>{PRIORITY_LABEL[result.priority]}</span>
                )}
                <button type="button" className="jpa-copy-btn" onClick={handleCopy}>{copyLabel}</button>
              </div>
            </div>

            <div className="jpa-fields">
              <div className="jpa-field-row"><span className="jpa-field-key">Ніша</span><span className="jpa-field-val">{result.niche || '—'}</span></div>
              <div className="jpa-field-row"><span className="jpa-field-key">Суть задачі</span><span className="jpa-field-val">{result.essence || '—'}</span></div>
              <div className="jpa-field-row"><span className="jpa-field-key">Потрібні послуги</span><span className="jpa-field-val">{result.services || '—'}</span></div>
              <div className="jpa-field-row"><span className="jpa-field-key">Бюджет/терміни</span><span className="jpa-field-val">{result.budget || '—'}</span></div>
              <div className="jpa-field-row"><span className="jpa-field-key">Червоні прапорці</span><span className="jpa-field-val">{result.flags || '—'}</span></div>
            </div>

            <div className="jpa-summary">{result.summary}</div>

            {onHandoff && (
              <button
                type="button" className="jpa-handoff-btn"
                onClick={() => onHandoff('cover-letter-agent', { jobPost, extraContext: briefAsExtraContext(result) })}
              >
                Написати cover letter на основі цього job post →
              </button>
            )}
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
