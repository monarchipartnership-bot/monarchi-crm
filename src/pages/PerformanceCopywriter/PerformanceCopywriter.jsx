import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { writeAdCopy } from '../../lib/api/performanceCopywriterApi';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/performanceCopywriterPage.css';

const AGENT_KEY = 'performance-copywriter';

const PLATFORMS = [
  { id: 'google_search', label: 'Google Search' },
  { id: 'meta_ads', label: 'Meta Ads' },
  { id: 'tiktok_script', label: 'TikTok сценарій' },
];

// Fifteenth real agent, third of Wave 3 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). Reuses CORE_WRITING_RULES_BLOCK from
// followupPrompt.js directly (same writing-quality bar every text-
// generating agent shares) with its own platform-specific format rules.
// Deliberately does NOT depend on creative-strategist's output (not
// built, may never be — see the flagged-blocked note on that agent) —
// takes a manually-described angle/hypothesis instead. Output varies
// structurally per platform (headline list vs. primary text vs. video
// script), so it's rendered as one raw block rather than parsed into
// typed fields, same approach as marketing-strategist.
export default function PerformanceCopywriter({ onClose }) {
  const [platform, setPlatform] = useState('meta_ads');
  const [productDescription, setProductDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [hypothesis, setHypothesis] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [copy, setCopy] = useState(null);
  const [copyLabel, setCopyLabel] = useState('Скопіювати');

  async function handleWrite() {
    if (!productDescription.trim() || !hypothesis.trim()) {
      setStatus({ text: 'Опиши продукт і гіпотезу перед написанням тексту.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setCopy(null);
    try {
      const written = await writeAdCopy({ platform, productDescription, audience, hypothesis });
      setCopy(written);
      setCopyLabel('Скопіювати');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка написання тексту. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!copy) return;
    try {
      await copyToClipboard(copy);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="pc-body">
        <div className="pc-field">
          <label className="pc-label">Платформа</label>
          <div className="pc-platform-row">
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" className={'pc-platform-pill' + (platform === p.id ? ' on' : '')} onClick={() => setPlatform(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pc-field">
          <label className="pc-label">Ніша/продукт</label>
          <textarea className="pc-textarea pc-textarea-small" value={productDescription} onChange={(e) => setProductDescription(e.target.value)} placeholder="Що продаємо, ключові факти…" />
        </div>

        <div className="pc-field">
          <label className="pc-label">Цільова аудиторія (необов&apos;язково)</label>
          <input type="text" className="pc-input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="напр. жінки 25-40, цікавляться…" />
        </div>

        <div className="pc-field pc-field-grow">
          <label className="pc-label">Гіпотеза (кут реклами)</label>
          <textarea className="pc-textarea pc-textarea-main" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="На який кут тестуємо — напр. соціальний доказ, знижка, страх втрати…" />
        </div>

        <div className="pc-actions">
          <button type="button" className="pc-run-btn" onClick={handleWrite} disabled={loading}>
            {loading ? 'Пишу текст…' : 'Написати текст'}
          </button>
          {status.text && <span className={'pc-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {copy && (
          <div className="pc-result">
            <div className="pc-result-head">
              <span className="pc-result-title">Готовий текст</span>
              <button type="button" className="pc-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="pc-result-text">{copy}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
