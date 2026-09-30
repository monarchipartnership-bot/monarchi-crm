import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { researchCompetitors } from '../../lib/api/competitorResearchApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/competitorResearchPage.css';

const AGENT_KEY = 'competitor-research-agent';

// Seventeenth real agent, second of the three paste-mode research agents
// (docs/ai-agents-roadmap.md §4.9, items 13-15). Manager pastes whatever
// material they already gathered per competitor (site copy, ad
// descriptions, pricing, positioning notes) — agent structures it into
// a comparison instead of doing live autonomous web research. Same "one
// long document" shape as marketing-strategist/business-research-agent.
export default function CompetitorResearchAgent({ onClose }) {
  const [businessContext, setBusinessContext] = useState('');
  const [competitorMaterial, setCompetitorMaterial] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати документ');

  async function handleResearch() {
    if (!competitorMaterial.trim()) {
      setStatus({ text: 'Встав зібраний матеріал про конкурента(ів) перед аналізом.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const researched = await researchCompetitors({ businessContext, competitorMaterial });
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
      <div className="crr-body">
        <div className="crr-field">
          <label className="crr-label">Бізнес нашого клієнта (коротко, необов&apos;язково)</label>
          <textarea className="crr-textarea crr-textarea-small" value={businessContext} onChange={(e) => setBusinessContext(e.target.value)} placeholder="Ніша, продукт, ключова відмінність…" />
        </div>

        <div className="crr-field crr-field-grow">
          <label className="crr-label">Зібраний матеріал про конкурента(ів)</label>
          <textarea
            className="crr-textarea crr-textarea-main" value={competitorMaterial} onChange={(e) => setCompetitorMaterial(e.target.value)}
            placeholder="Встав інформацію про одного чи кількох конкурентів — сайт, реклама, ціни, позиціонування…"
          />
        </div>

        <div className="crr-actions">
          <button type="button" className="crr-run-btn" onClick={handleResearch} disabled={loading}>
            {loading ? 'Аналізую…' : 'Проаналізувати конкурентів'}
          </button>
          {status.text && <span className={'crr-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="crr-result">
            <div className="crr-result-head">
              <span className="crr-result-title">Аналіз конкурентів</span>
              <button type="button" className="crr-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="crr-result-text">{result}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
