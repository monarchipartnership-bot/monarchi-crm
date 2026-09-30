import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { enrichAccount } from '../../lib/api/accountEnrichmentApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/accountEnrichmentPage.css';

const AGENT_KEY = 'account-enrichment';

// Sixth real agent, first of the locked build queue (docs/ai-agents-
// roadmap.md §4.9). Reinterpreted to avoid the original paid-enrichment-
// API blocker: fetches the client's own website server-side
// (api/fetch-website-text.js, hardened against SSRF since the URL comes
// from CRM data) and has an LLM summarize niche/size/positioning into a
// ready-to-paste "Додатковий контекст" paragraph for Cover Letter/
// Follow-up — no new vendor needed. Same "no client_id yet" shape as
// Cover Letter/Job Post Analyzer for its manual/standalone use: not
// wired into the activity feed.
export default function AccountEnrichment({ onClose }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати контекст');

  async function handleEnrich() {
    if (!url.trim()) {
      setStatus({ text: 'Встав URL сайту клієнта перед запуском.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const enriched = await enrichAccount({ url: url.trim() });
      setResult(enriched);
      setCopyLabel('Скопіювати контекст');
    } catch (e) {
      console.error(e);
      setStatus({ text: e.message || 'Помилка збагачення даних. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result?.context) return;
    try {
      await copyToClipboard(result.context);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати контекст'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="ae-body">
        <div className="ae-field">
          <label className="ae-label">Сайт клієнта</label>
          <input
            type="text" className="ae-input" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="напр. example.com або https://example.com"
            onKeyDown={(e) => { if (e.key === 'Enter') handleEnrich(); }}
          />
        </div>

        <div className="ae-actions">
          <button type="button" className="ae-run-btn" onClick={handleEnrich} disabled={loading}>
            {loading ? 'Аналізую сайт…' : 'Отримати контекст'}
          </button>
          {status.text && <span className={'ae-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="ae-result">
            <div className="ae-fields">
              <div className="ae-field-row"><span className="ae-field-key">Ніша</span><span className="ae-field-val">{result.niche || '—'}</span></div>
              <div className="ae-field-row"><span className="ae-field-key">Розмір бізнесу</span><span className="ae-field-val">{result.companySize || '—'}</span></div>
              <div className="ae-field-row"><span className="ae-field-key">Позиціонування</span><span className="ae-field-val">{result.positioning || '—'}</span></div>
            </div>

            <div className="ae-context-head">
              <span className="ae-context-title">Готовий контекст для «Додатковий контекст»</span>
              <button type="button" className="ae-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="ae-context-text">{result.context}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
