import { useEffect, useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import DealPicker from '../../components/Deals/DealPicker';
import { fetchAllDeals } from '../../lib/api/deals';
import { qualifyLead } from '../../lib/api/leadQualificationApi';
import '../../styles/leadQualificationPage.css';

const AGENT_KEY = 'lead-qualification-agent';

const VERDICT_LABEL = { 'КВАЛІФІКОВАНО': 'Кваліфіковано', 'ПІД ПИТАННЯМ': 'Під питанням', 'НЕ КВАЛІФІКОВАНО': 'Не кваліфіковано' };
const VERDICT_CLASS = { 'КВАЛІФІКОВАНО': 'ok', 'ПІД ПИТАННЯМ': 'warn', 'НЕ КВАЛІФІКОВАНО': 'bad' };

// Thirteenth real agent, first of Wave 3 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). Deliberately does NOT hardcode ICP criteria
// — no such definition exists anywhere in this project to reuse, and
// inventing target-niche/budget/disqualifier rules would mean fabricating
// a business decision nobody made. The ICP criteria are a required text
// input the manager supplies themselves. Operates on a real CRM deal
// (via the existing DealPicker) rather than freeform pasted text — the
// differentiator from job-post-analyzer, which works pre-deal on raw job
// post text. Same "no client_id yet" shape as the other manual tools for
// activity-feed purposes — this reads a deal but doesn't log a new
// conversation anywhere.
export default function LeadQualificationAgent({ onClose }) {
  const [deals, setDeals] = useState([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [deal, setDeal] = useState(null);
  const [icpCriteria, setIcpCriteria] = useState('');

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAllDeals().then((data) => { if (alive) { setDeals(data); setDealsLoading(false); } });
    return () => { alive = false; };
  }, []);

  async function handleQualify() {
    if (!deal) {
      setStatus({ text: 'Обери угоду перед кваліфікацією.', error: true });
      return;
    }
    if (!icpCriteria.trim()) {
      setStatus({ text: 'Опиши критерії ICP перед кваліфікацією.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const qualified = await qualifyLead({ deal, icpCriteria });
      setResult(qualified);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка кваліфікації. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="lqa-body">
        <div className="lqa-field">
          <label className="lqa-label">Угода</label>
          {dealsLoading ? <div className="lqa-loading">Завантажую угоди…</div> : <DealPicker value={deal?.id} onChange={setDeal} deals={deals} />}
        </div>

        <div className="lqa-field lqa-field-grow">
          <label className="lqa-label">Критерії ICP</label>
          <textarea
            className="lqa-textarea" value={icpCriteria} onChange={(e) => setIcpCriteria(e.target.value)}
            placeholder="Опиши актуальні критерії ICP — ніша, мінімальний бюджет, географія, що дискваліфікує тощо…"
          />
        </div>

        <div className="lqa-actions">
          <button type="button" className="lqa-run-btn" onClick={handleQualify} disabled={loading}>
            {loading ? 'Кваліфікую…' : 'Перевірити відповідність ICP'}
          </button>
          {status.text && <span className={'lqa-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="lqa-result">
            {result.verdict && VERDICT_LABEL[result.verdict] && (
              <span className={'lqa-verdict lqa-verdict--' + VERDICT_CLASS[result.verdict]}>{VERDICT_LABEL[result.verdict]}</span>
            )}
            {result.criteriaAssessment && <p className="lqa-criteria">{result.criteriaAssessment}</p>}
            <p className="lqa-summary">{result.summary}</p>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
