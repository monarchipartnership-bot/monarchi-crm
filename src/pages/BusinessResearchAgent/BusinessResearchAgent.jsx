import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { researchBusiness } from '../../lib/api/businessResearchApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/businessResearchPage.css';

const AGENT_KEY = 'business-research-agent';

// Sixteenth real agent, first of the three paste-mode research agents
// (docs/ai-agents-roadmap.md §4.9, items 13-15). Manager pastes research
// they already gathered (site copy, About page, notes) rather than the
// agent doing live autonomous web research — matches this agent's own
// ladder.humanLed→humanAssisted rung. Same "one long document" shape as
// marketing-strategist — not parsed into strict fields.
export default function BusinessResearchAgent({ onClose }) {
  const [businessNameOrNiche, setBusinessNameOrNiche] = useState('');
  const [rawMaterial, setRawMaterial] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати документ');

  async function handleResearch() {
    if (!rawMaterial.trim()) {
      setStatus({ text: 'Встав зібраний матеріал про бізнес перед аналізом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const researched = await researchBusiness({ businessNameOrNiche, rawMaterial });
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
      <div className="brr-body">
        <div className="brr-field">
          <label className="brr-label">Назва/ніша клієнта (необов&apos;язково)</label>
          <input type="text" className="brr-input" value={businessNameOrNiche} onChange={(e) => setBusinessNameOrNiche(e.target.value)} placeholder="напр. Sombra AI" />
        </div>

        <div className="brr-field brr-field-grow">
          <label className="brr-label">Зібраний матеріал</label>
          <textarea
            className="brr-textarea brr-textarea-main" value={rawMaterial} onChange={(e) => setRawMaterial(e.target.value)}
            placeholder="Встав текст із сайту, About-сторінки, нотатки — що вже вдалось зібрати про бізнес клієнта…"
          />
        </div>

        <div className="brr-actions">
          <button type="button" className="brr-run-btn" onClick={handleResearch} disabled={loading}>
            {loading ? 'Аналізую…' : 'Розібрати бізнес'}
          </button>
          {status.text && <span className={'brr-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="brr-result">
            <div className="brr-result-head">
              <span className="brr-result-title">Бізнес-дослідження</span>
              <button type="button" className="brr-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="brr-result-text">{result}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
