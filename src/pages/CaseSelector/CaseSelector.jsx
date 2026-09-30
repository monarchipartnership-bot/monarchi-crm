import { useEffect, useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { fetchFollowupCases } from '../../lib/api/followupCases';
import { selectCase } from '../../lib/api/caseSelectorApi';
import '../../styles/caseSelectorPage.css';

const AGENT_KEY = 'portfolio-case-selector';

// Seventh real agent, second of the locked build queue (docs/ai-agents-
// roadmap.md §4.9) — a standalone version of the case-matching step
// Cover Letter/Follow-up already do inline. Useful on its own before a
// live sales call or when writing a proposal doc, without generating a
// full message. Reuses the exact same followup_cases database. Same
// "no client_id yet" shape as Cover Letter/Job Post Analyzer — not
// wired into the activity feed.
export default function CaseSelector({ onClose }) {
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [leadDescription, setLeadDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchFollowupCases().then((data) => { if (alive) { setCases(data); setCasesLoading(false); } });
    return () => { alive = false; };
  }, []);

  async function handleSelect() {
    if (!leadDescription.trim()) {
      setStatus({ text: 'Опиши ліда чи задачу клієнта перед підбором.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const selected = await selectCase({ leadDescription, cases });
      setResult(selected);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка підбору кейсу. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  const matchedCase = result?.caseUsed ? cases.find((c) => c.name.toLowerCase() === result.caseUsed.toLowerCase()) : null;

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="cs-body">
        <div className="cs-field cs-field-grow">
          <label className="cs-label">Опис ліда чи задачі клієнта</label>
          <textarea
            className="cs-textarea" value={leadDescription} onChange={(e) => setLeadDescription(e.target.value)}
            placeholder="Опиши нішу, задачу клієнта, продукт чи технічну архітектуру…"
          />
        </div>

        <div className="cs-actions">
          <button type="button" className="cs-run-btn" onClick={handleSelect} disabled={loading || casesLoading}>
            {loading ? 'Підбираю…' : casesLoading ? 'Завантажую кейси…' : 'Підібрати кейс'}
          </button>
          {status.text && <span className={'cs-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="cs-result">
            <span className="cs-result-case">{result.caseUsed || 'Жоден кейс не підходить'}</span>
            {matchedCase && <p className="cs-result-case-desc">{matchedCase.description}</p>}
            <p className="cs-result-reasoning">{result.reasoning}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
