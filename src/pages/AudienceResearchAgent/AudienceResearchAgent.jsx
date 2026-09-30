import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { researchAudience } from '../../lib/api/audienceResearchApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/audienceResearchPage.css';

const AGENT_KEY = 'audience-research-agent';

// Eighteenth real agent, third of the three paste-mode research agents
// (docs/ai-agents-roadmap.md §4.9, items 13-15). Breaks the market into
// 2-4 workable audience segments (pain/motivation/trigger/message) from
// a business/product description plus whatever research the manager
// already has — not live autonomous audience research. Same "one long
// document" shape as the other two research agents.
export default function AudienceResearchAgent({ onClose }) {
  const [businessDescription, setBusinessDescription] = useState('');
  const [existingResearch, setExistingResearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати документ');

  async function handleResearch() {
    if (!businessDescription.trim()) {
      setStatus({ text: 'Опиши бізнес/продукт клієнта перед аналізом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const researched = await researchAudience({ businessDescription, existingResearch });
      setResult(researched);
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
      <div className="arr-body">
        <div className="arr-field arr-field-grow">
          <label className="arr-label">Бізнес/продукт клієнта</label>
          <textarea
            className="arr-textarea arr-textarea-main" value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="Ніша, продукт, хто зазвичай купує…"
          />
        </div>

        <div className="arr-field">
          <label className="arr-label">Вже зібрані дослідження/дані (необов&apos;язково)</label>
          <textarea className="arr-textarea arr-textarea-small" value={existingResearch} onChange={(e) => setExistingResearch(e.target.value)} placeholder="напр. вивід з Агента дослідження бізнесу, нотатки менеджера…" />
        </div>

        <div className="arr-actions">
          <button type="button" className="arr-run-btn" onClick={handleResearch} disabled={loading}>
            {loading ? 'Аналізую…' : 'Розбити на сегменти'}
          </button>
          {status.text && <span className={'arr-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="arr-result">
            <div className="arr-result-head">
              <span className="arr-result-title">Аудиторні сегменти</span>
              <button type="button" className="arr-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="arr-result-text">{result}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
