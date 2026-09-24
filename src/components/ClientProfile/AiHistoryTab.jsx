import { useEffect, useState } from 'react';
import { fetchConversations, fetchConversationMessages } from '../../lib/api/aiConversations';
import ChatMessage from '../../pages/AdsInsightsAnalyst/ChatMessage';
import '../../styles/adsInsightsAnalystPage.css';

const AGENT_LABEL = { 'ads-insights-analyst': 'Аналітик рекламних даних та інсайтів' };

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// Read-only log of every AI-agent conversation held about this client —
// same ai_agent_conversations/ai_agent_messages data as the agent's own
// "Історія" tab (src/pages/AdsInsightsAnalyst/AdsInsightsAnalyst.jsx), just
// viewed from the client's side. Table/chart messages reuse ChatMessage's
// dark-styled AiaTable/AiaChart as-is (a small dark card inside this
// otherwise light tab) rather than duplicating a whole second light theme
// for what's a secondary, read-only view.
export default function AiHistoryTab({ clientId }) {
  const [conversations, setConversations] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState(null);

  useEffect(() => {
    fetchConversations(clientId).then((data) => {
      setConversations(data);
      if (data.length) setSelectedId(data[0].id);
    });
  }, [clientId]);

  useEffect(() => {
    if (!selectedId) { setMessages(null); return; }
    setMessages(null);
    fetchConversationMessages(selectedId).then(setMessages);
  }, [selectedId]);

  if (conversations === null) return <p className="client-history-empty">Завантаження…</p>;
  if (!conversations.length) return <p className="client-history-empty">AI-агенти ще не працювали з цим клієнтом.</p>;

  return (
    <div className="ai-history-tab">
      <aside className="ai-history-list">
        {conversations.map((c) => (
          <button
            key={c.id} type="button"
            className={'ai-history-row' + (selectedId === c.id ? ' active' : '')}
            onClick={() => setSelectedId(c.id)}
          >
            <span className="ai-history-row-agent">{AGENT_LABEL[c.agent_key] || c.agent_key}</span>
            <span className="ai-history-row-title">{c.title || 'Розмова'}</span>
            <span className="ai-history-row-date">{fmtDate(c.updated_at)}</span>
          </button>
        ))}
      </aside>

      <section className="ai-history-transcript">
        {messages === null && <p className="client-history-empty">Завантаження…</p>}
        {messages?.map((m, i) => <ChatMessage key={i} role={m.role} content={m.content} visual={m.visual} />)}
      </section>
    </div>
  );
}
