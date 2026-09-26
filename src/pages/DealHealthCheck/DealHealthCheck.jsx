import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { runDealHealthCheck } from '../../lib/api/dealHealthCheck';
import '../../styles/dealHealthCheckPage.css';

const AGENT_KEY = 'deal-health-check';
const REFRESH_ICON = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>';
const OPEN_ICON = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>';

const THRESHOLDS = [
  { value: 7, label: '7+ днів' },
  { value: 14, label: '14+ днів' },
  { value: 30, label: '30+ днів' },
];

function fmtMoney(amount, currency) {
  if (amount == null) return '—';
  return `${Number(amount).toLocaleString('uk-UA')} ${currency || ''}`.trim();
}

// The second real agent (after AdsInsightsAnalyst) — human-assisted, not a
// chat: it scans every open deal, flags the ones with no activity in at
// least `minDays`, and hands the human a list with a reason, per its own
// design in aiAgentsData.js (ladder.humanAssisted: "Агент сам формує
// список «потребують уваги» щодня"). The human decides what to do with
// each — deal-health-check never touches a deal itself, only links out to
// the real Deals board (`/reports/deals?open=<id>`, the same deep-link
// convention notifications already use there).
export default function DealHealthCheck({ onClose }) {
  const [minDays, setMinDays] = useState(7);
  const [staleDeals, setStaleDeals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  async function runCheck() {
    setLoading(true);
    try {
      const deals = await runDealHealthCheck(minDays);
      setStaleDeals(deals);
      setLastRun(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runCheck(); }, [minDays]);

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="dhc-controls">
        <div className="dhc-thresholds">
          {THRESHOLDS.map((t) => (
            <button
              key={t.value} type="button" className={'dhc-threshold-btn' + (minDays === t.value ? ' active' : '')}
              onClick={() => setMinDays(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="dhc-refresh-btn" onClick={runCheck} disabled={loading}>
          <span dangerouslySetInnerHTML={{ __html: REFRESH_ICON }} />
          {loading ? 'Перевіряю…' : 'Оновити'}
        </button>
      </div>

      {lastRun && !loading && (
        <div className="dhc-summary">
          {staleDeals.length
            ? `${staleDeals.length} ${staleDeals.length === 1 ? 'угода потребує' : 'угод потребують'} уваги · перевірено ${lastRun.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
            : `Жодної застоялої угоди — перевірено ${lastRun.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`}
        </div>
      )}

      <div className="dhc-list">
        {loading && !staleDeals && <div className="agent-workspace-empty">Перевіряю угоди…</div>}
        {!loading && staleDeals?.length === 0 && (
          <div className="agent-workspace-empty">Усі відкриті угоди мали активність за останні {minDays} днів. Гарна робота!</div>
        )}
        {staleDeals?.map((deal) => (
          <div key={deal.id} className="dhc-card" style={{ '--stage-color': deal.deal_stages?.color || '#8B5CF6' }}>
            <div className="dhc-card-main">
              <div className="dhc-card-title-row">
                <span className="dhc-card-stage-dot" />
                <span className="dhc-card-title">{deal.title || deal.clients?.company || deal.clients?.name || 'Без назви'}</span>
                <span className="dhc-card-days">{deal.daysStale} днів без активності</span>
              </div>
              <div className="dhc-card-meta">
                {deal.deal_stages?.label || '—'} · {fmtMoney(deal.amount, deal.currency)}
                {deal.manager && <> · {deal.manager}</>}
              </div>
              <div className="dhc-card-reason">
                Причина: {deal.daysStale} днів без оновлення на етапі «{deal.deal_stages?.label || '—'}».
              </div>
            </div>
            <Link to={`/reports/deals?open=${deal.id}`} className="dhc-card-open" target="_blank" rel="noreferrer">
              <span dangerouslySetInnerHTML={{ __html: OPEN_ICON }} /> Відкрити
            </Link>
          </div>
        ))}
      </div>
    </AgentWorkspaceShell>
  );
}
