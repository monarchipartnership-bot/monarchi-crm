import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAgentActivity, markReviewed } from '../../lib/api/agentActivity';
import { fetchConversationMessages } from '../../lib/api/aiConversations';
import { fetchClientDirectory } from '../../lib/api/clients';
import { findAgentByKey } from '../../data/aiAgentsData';
import Select from '../../components/common/Select';
import ChatMessage from '../AdsInsightsAnalyst/ChatMessage';
import '../../styles/reportPage.css';
import '../../styles/aiAgentActivityPage.css';

const TASKS_ICON = '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h.01M8 12h.01M8 16h.01"/><path d="M11.5 8h5M11.5 12h5M11.5 16h5"/></svg>';
const KIND_LABEL = { chat: 'Чат', audit: 'Аудит' };
const KIND_OPTIONS = [
  { value: '', label: 'Усі типи' },
  { value: 'chat', label: 'Чат' },
  { value: 'audit', label: 'Аудит' },
];

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Phase 1 of docs/ai-agents-roadmap.md — a dedicated, cross-client feed of
// every AI-agent run (ai_agent_conversations, same table the agent's own
// "Історія" tab and ClientProfile's "AI Team work history" read), plus a
// review queue for audits (kind:'audit' conversations are flagged
// needs_review on creation — see AdsInsightsAnalyst.jsx's runAudit()).
// Deliberately its own page, not folded into the existing human Task
// Manager — an agent run's lifecycle (queued/running/needs-review/
// reviewed) doesn't map onto human task statuses.
export default function AiAgentActivity() {
  const { email } = useAuth();
  const [activity, setActivity] = useState(null);
  const [clients, setClients] = useState([]);
  const [kindFilter, setKindFilter] = useState('');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [messagesByConv, setMessagesByConv] = useState({});

  useEffect(() => { fetchClientDirectory().then(setClients); }, []);

  useEffect(() => {
    let alive = true;
    setActivity(null);
    fetchAgentActivity({ kind: kindFilter || undefined, needsReviewOnly: reviewOnly }).then((data) => {
      if (alive) setActivity(data);
    });
    return () => { alive = false; };
  }, [kindFilter, reviewOnly]);

  function clientLabel(id) {
    const c = clients.find((cl) => String(cl.id) === String(id));
    return c ? (c.company || c.name) : '—';
  }

  const needsReviewCount = useMemo(() => (activity || []).filter((a) => a.needs_review).length, [activity]);

  async function toggleExpand(conv) {
    if (expandedId === conv.id) { setExpandedId(null); return; }
    setExpandedId(conv.id);
    if (!messagesByConv[conv.id]) {
      const msgs = await fetchConversationMessages(conv.id);
      setMessagesByConv((m) => ({ ...m, [conv.id]: msgs }));
    }
  }

  async function handleMarkReviewed(conv) {
    const updated = await markReviewed(conv.id, email);
    setActivity((list) => list.map((a) => (a.id === conv.id ? updated : a)));
  }

  const loading = activity === null;

  return (
    <div>
      <div className="aia-activity-head-row">
        <span className="aia-activity-head-icon" dangerouslySetInnerHTML={{ __html: TASKS_ICON }} />
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div className="page-kicker">AUTOMATION</div>
          <h1>Задачі агентів</h1>
        </div>
      </div>
      <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '.88rem', margin: '0 0 20px' }}>
        Хто з AI-агентів що робив і що ще чекає на перевірку людиною.
      </p>

      <div className="aia-activity-filters">
        <Select value={kindFilter} onChange={setKindFilter} options={KIND_OPTIONS} />
        <button type="button" className={'btn' + (reviewOnly ? ' btn-p' : '')} onClick={() => setReviewOnly((v) => !v)}>
          На перевірку{needsReviewCount ? ` (${needsReviewCount})` : ''}
        </button>
      </div>

      {loading && <div className="aia-activity-empty">Завантаження…</div>}
      {!loading && !activity.length && <div className="aia-activity-empty">Ще немає активності агентів.</div>}

      <div className="aia-activity-list">
        {activity?.map((conv) => {
          const agent = findAgentByKey(conv.agent_key);
          const expanded = expandedId === conv.id;
          return (
            <div key={conv.id} className={'aia-activity-card' + (conv.needs_review ? ' needs-review' : '')}>
              <button type="button" className="aia-activity-row" onClick={() => toggleExpand(conv)}>
                <span className={'aia-activity-kind aia-activity-kind--' + conv.kind}>{KIND_LABEL[conv.kind] || conv.kind}</span>
                <span className="aia-activity-main">
                  <span className="aia-activity-agent">{agent?.name || conv.agent_key}</span>
                  <span className="aia-activity-title">{conv.title || 'Розмова'}</span>
                </span>
                <span className="aia-activity-client">{clientLabel(conv.client_id)}</span>
                <span className="aia-activity-meta">{conv.created_by || '—'} · {fmtDate(conv.updated_at)}</span>
                {conv.needs_review && <span className="aia-activity-badge">На перевірку</span>}
                {!conv.needs_review && conv.reviewed_by && <span className="aia-activity-reviewed">Перевірено · {conv.reviewed_by}</span>}
              </button>

              {expanded && (
                <div className="aia-activity-transcript">
                  {!messagesByConv[conv.id] && <div className="aia-activity-empty">Завантаження…</div>}
                  {messagesByConv[conv.id]?.map((m, i) => (
                    <ChatMessage key={i} role={m.role} content={m.content} visual={m.visual} />
                  ))}
                  {conv.needs_review && (
                    <button type="button" className="btn btn-p" onClick={() => handleMarkReviewed(conv)}>
                      Позначити переглянутим
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
