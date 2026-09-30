import { useEffect, useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { generateCoverLetter } from '../../lib/api/coverLetterApi';
import { STYLE_OPTIONS } from '../../lib/followupPrompt';
import { fetchFollowupCases } from '../../lib/api/followupCases';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';
import { flagClass } from '../../lib/countries';
import { copyToClipboard } from '../../lib/clipboard';
import '../../styles/coverLetterAgentPage.css';

const AGENT_KEY = 'cover-letter-agent';
const DEFAULT_STYLE_ID = 'upwork';

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English', iconClassName: flagClass('GB') },
  { value: 'Ukrainian', label: 'Українська', iconClassName: flagClass('UA') },
];

// Third real agent — reuses the Follow-up Generator's CORE+STYLE prompt
// architecture directly (see coverLetterPrompt.js) and its case-study
// database (followupCases.js). Human-assisted, one-shot generation from a
// pasted job post: no client_id, no conversation to log, so — same as
// DealHealthCheck — deliberately not wired into the ai_agent_conversations
// activity feed.
//
// `initialPayload` (optional) is set only by a handoff from another agent
// tool (§4.5 of the roadmap — JobPostAnalyzer's "Написати cover letter"
// button, see ConstellationTest.jsx's handoffToAgentTool) — a normal open
// from the map/catalog/search always passes null, same blank slate as
// before this existed.
export default function CoverLetterAgent({ onClose, initialPayload }) {
  const [language, setLanguage] = useState('English');
  const [style, setStyle] = useState(DEFAULT_STYLE_ID);

  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [selectedCases, setSelectedCases] = useState(new Set());

  const [jobPost, setJobPost] = useState(initialPayload?.jobPost || '');
  const [extraContext, setExtraContext] = useState(initialPayload?.extraContext || '');

  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null); // { message, caseUsed }
  const [copyLabel, setCopyLabel] = useState('Скопіювати');

  useEffect(() => {
    let alive = true;
    fetchFollowupCases().then((data) => { if (alive) { setCases(data); setCasesLoading(false); } });
    return () => { alive = false; };
  }, []);

  function toggleCase(id) {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    if (!jobPost.trim()) {
      setStatus({ text: 'Встав текст job post перед генерацією.', error: true });
      return;
    }
    setGenerating(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const selected = cases.filter((c) => selectedCases.has(c.id));
      const generated = await generateCoverLetter({ jobPost, extraContext, language, style, cases, selectedCases: selected });
      setResult(generated);
      setCopyLabel('Скопіювати');
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка генерації. Спробуй ще раз.', error: true });
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    if (!result?.message) return;
    try {
      await copyToClipboard(result.message);
      setCopyLabel('Скопійовано ✓');
      setTimeout(() => setCopyLabel('Скопіювати'), 1800);
    } catch {
      setStatus({ text: 'Не вдалось скопіювати.', error: true });
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="cla-body">
        <div className="cla-field">
          <label className="cla-label">Мова</label>
          <div className="cla-lang-pills">
            {LANGUAGE_OPTIONS.map((l) => (
              <button key={l.value} type="button" className={'cla-lang-pill' + (language === l.value ? ' on' : '')} onClick={() => setLanguage(l.value)}>
                <span className={l.iconClassName} /> {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cla-field">
          <label className="cla-label">Стиль</label>
          <div className="cla-style-row">
            {STYLE_OPTIONS.map((s) => (
              <button key={s.id} type="button" className={'cla-style-pill' + (style === s.id ? ' on' : '')} onClick={() => setStyle(s.id)}>
                <span className="cla-style-pill-ic" dangerouslySetInnerHTML={{ __html: FIELD_ICONS[s.icon] }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cla-field">
          <label className="cla-label">
            Кейси Mon&apos;Archi
            {selectedCases.size > 0 && <span className="cla-label-hint"> — обрано {selectedCases.size}, інакше агент обере сам</span>}
          </label>
          {casesLoading ? (
            <div className="cla-cases-loading">Завантажую кейси…</div>
          ) : (
            <div className="cla-cases-row">
              {cases.map((c) => (
                <button key={c.id} type="button" className={'cla-case-chip' + (selectedCases.has(c.id) ? ' on' : '')} onClick={() => toggleCase(c.id)} title={c.description}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="cla-field cla-field-grow">
          <label className="cla-label">
            Job post клієнта (Upwork)
            {initialPayload?.jobPost && <span className="cla-label-hint"> — підставлено з Агента аналізу оголошень</span>}
          </label>
          <textarea className="cla-textarea cla-textarea-job" value={jobPost} onChange={(e) => setJobPost(e.target.value)} placeholder="Встав текст вакансії з Upwork…" />
        </div>

        <div className="cla-field">
          <label className="cla-label">Додатковий контекст (необов&apos;язково)</label>
          <textarea className="cla-textarea cla-textarea-context" value={extraContext} onChange={(e) => setExtraContext(e.target.value)} placeholder="Будь-які деталі, які варто врахувати…" />
        </div>

        <div className="cla-actions">
          <button type="button" className="cla-generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Генерую…' : 'Згенерувати cover letter'}
          </button>
          {status.text && <span className={'cla-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="cla-result">
            <div className="cla-result-head">
              <span className="cla-result-case">{result.caseUsed ? `Кейс: ${result.caseUsed}` : 'Кейс не використано'}</span>
              <button type="button" className="cla-copy-btn" onClick={handleCopy}>{copyLabel}</button>
            </div>
            <div className="cla-result-text">{result.message}</div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
