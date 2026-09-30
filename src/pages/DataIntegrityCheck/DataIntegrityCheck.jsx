import { useEffect, useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import { fetchAgentActivity } from '../../lib/api/agentActivity';
import { fetchConversationMessages } from '../../lib/api/aiConversations';
import '../../styles/dataIntegrityCheckPage.css';

const AGENT_KEY = 'tracking-data-integrity-agent';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Fifth real agent — three fully deterministic checks (RLS blanket-policy
// regression, pg_cron job failures, stale needs_review backlog), all run
// once a day via pg_cron (run_data_integrity_check(), see the migration
// for detail) — no LLM call, same pattern as deal-health-check's
// scheduled run.
//
// Deliberately READ-ONLY, no "check now" button (unlike DealHealthCheck):
// two of the three checks read pg_catalog/cron schema tables that simply
// aren't exposed over PostgREST at all, so there's no safe way to re-run
// this from the browser without either duplicating the logic client-side
// (defeats the point) or granting RPC EXECUTE to authenticated users on a
// SECURITY DEFINER function (reopens the exact kind of public-RPC
// exposure the same-day security fix closed). This page just surfaces
// the latest daily result.
export default function DataIntegrityCheck({ onClose }) {
  const [latest, setLatest] = useState(null); // undefined-until-loaded via null check below
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchAgentActivity({ agentKey: AGENT_KEY }).then(async (rows) => {
      if (!alive) return;
      const mostRecent = rows[0] || null;
      setLatest(mostRecent);
      if (mostRecent) {
        const msgs = await fetchConversationMessages(mostRecent.id);
        if (alive) setMessage(msgs[0]?.content || '');
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="dic-body">
        {loading && <div className="agent-workspace-empty">Завантаження…</div>}

        {!loading && !latest && (
          <div className="agent-workspace-empty">
            Ще жодної перевірки не було залоговано. Перша автоматична перевірка запуститься за розкладом (щодня о 07:00 UTC).
          </div>
        )}

        {!loading && latest && (
          <>
            <div className={'dic-status-card' + (latest.needs_review ? ' warn' : ' ok')}>
              <span className="dic-status-title">{latest.title}</span>
              <span className="dic-status-meta">Востаннє перевірено: {fmtDate(latest.updated_at)}</span>
            </div>
            <pre className="dic-report">{message}</pre>
            <p className="dic-note">
              Перевірка запускається автоматично щодня — RLS-регресія (та сама уразливість, знайдена й закрита 2026-09-30),
              збої запланованих задач (pg_cron) та застояла черга «На перевірку» (3+ дні без реакції людини).
            </p>
          </>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
