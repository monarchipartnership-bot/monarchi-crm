import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { buildStrategy } from '../../lib/api/marketingStrategistApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/marketingStrategistPage.css';

const AGENT_KEY = 'marketing-strategist';

// Eleventh real agent, second of Wave 2 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). Deliberately does NOT depend on the
// not-yet-built research agents (business/competitor/audience research)
// — takes whatever business context/goals/research the manager already
// has as plain text input instead of automated upstream feeds. Unlike
// most agents so far, its natural output is one longer structured
// document rather than a handful of short fields, so the result is
// rendered as one block rather than parsed into typed fields. Same "no
// client_id yet" shape as the other manual/standalone tools — not wired
// into the activity feed.
export default function MarketingStrategist({ onClose }) {
  const [businessDescription, setBusinessDescription] = useState('');
  const [goals, setGoals] = useState('');
  const [budget, setBudget] = useState('');
  const [audienceNotes, setAudienceNotes] = useState('');
  const [existingResearch, setExistingResearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [strategy, setStrategy] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати стратегію');

  async function handleBuild() {
    if (!businessDescription.trim()) {
      setStatus({ text: 'Опиши бізнес клієнта перед побудовою стратегії.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setStrategy(null);
    try {
      const built = await buildStrategy({ businessDescription, goals, budget, audienceNotes, existingResearch });
      setStrategy(built);
      setCopyLabel('Скопіювати стратегію');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка побудови стратегії. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!strategy) return;
    try {
      await copyToClipboard(strategy);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати стратегію'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="ms-body">
        <div className="ms-field ms-field-grow">
          <label className="ms-label">Бізнес клієнта</label>
          <textarea
            className="ms-textarea ms-textarea-main" value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="Ніша, продукт, поточна ситуація…"
          />
        </div>

        <div className="ms-row">
          <div className="ms-field">
            <label className="ms-label">Цілі</label>
            <input type="text" className="ms-input" value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="напр. подвоїти ліди за 3 місяці" />
          </div>
          <div className="ms-field">
            <label className="ms-label">Бюджет</label>
            <input type="text" className="ms-input" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="напр. $5000/міс" />
          </div>
        </div>

        <div className="ms-field">
          <label className="ms-label">Нотатки про аудиторію (необов&apos;язково)</label>
          <textarea className="ms-textarea ms-textarea-small" value={audienceNotes} onChange={(e) => setAudienceNotes(e.target.value)} placeholder="Хто клієнти, демографія, поведінка…" />
        </div>

        <div className="ms-field">
          <label className="ms-label">Вже зібрані дослідження/дані (необов&apos;язково)</label>
          <textarea className="ms-textarea ms-textarea-small" value={existingResearch} onChange={(e) => setExistingResearch(e.target.value)} placeholder="Що вже відомо про конкурентів, ринок, попередні кампанії…" />
        </div>

        <div className="ms-actions">
          <button type="button" className="ms-run-btn" onClick={handleBuild} disabled={loading}>
            {loading ? 'Складаю стратегію…' : 'Скласти стратегію'}
          </button>
          {status.text && <span className={'ms-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {strategy && (
          <div className="ms-result">
            <div className="ms-result-head">
              <span className="ms-result-title">Performance marketing strategy</span>
              <button type="button" className="ms-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="ms-result-text">{strategy}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
