import { useState } from 'react';
import AgentWorkspaceShell from '../../components/AgentWorkspace/AgentWorkspaceShell';
import ClientPicker from '../../components/Clients/ClientPicker';
import { buildClientBriefing } from '../../lib/api/accountManagerApi';
import '../../styles/aiAccountManagerPage.css';

const AGENT_KEY = 'ai-account-manager';

// Twelfth real agent, fourth of Wave 2 in the locked build queue (docs/
// ai-agents-roadmap.md §4.9). Unlike most agents so far, its input isn't
// pasted text — it's a deterministic aggregation of a client's existing
// CRM data (clients/deals/tasks/ai_agent_conversations, see
// src/lib/api/accountManagerData.js), all via already-proven fetch
// functions other pages already use. The LLM's only job is turning that
// already-gathered digest into a narrative briefing, not fetching or
// inventing anything itself.
export default function AiAccountManager({ onClose }) {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ text: '', error: false });
  const [result, setResult] = useState(null);

  async function handleBuild() {
    if (!client) {
      setStatus({ text: 'Обери клієнта перед складанням брифінгу.', error: true });
      return;
    }
    setLoading(true);
    setStatus({ text: '', error: false });
    setResult(null);
    try {
      const briefing = await buildClientBriefing(client.id);
      setResult(briefing);
    } catch (e) {
      console.error(e);
      setStatus({ text: 'Помилка складання брифінгу. Спробуй ще раз.', error: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AgentWorkspaceShell agentKey={AGENT_KEY} onClose={onClose}>
      <div className="aam-body">
        <div className="aam-field">
          <label className="aam-label">Клієнт</label>
          <ClientPicker value={client?.id} onChange={setClient} placeholder="Пошук клієнта…" />
        </div>

        <div className="aam-actions">
          <button type="button" className="aam-run-btn" onClick={handleBuild} disabled={loading}>
            {loading ? 'Складаю брифінг…' : 'Скласти брифінг'}
          </button>
          {status.text && <span className={'aam-status' + (status.error ? ' error' : '')}>{status.text}</span>}
        </div>

        {result && (
          <div className="aam-result">
            <div className="aam-result-head">
              {result.status && <span className="aam-status-badge">{result.status}</span>}
            </div>

            {result.attention && (
              <div className="aam-attention">
                <span className="aam-attention-title">Потребує уваги</span>
                <p className="aam-attention-text">{result.attention}</p>
              </div>
            )}

            <p className="aam-briefing">{result.briefing}</p>

            <div className="aam-stats">
              <span>{result.deals.length} {result.deals.length === 1 ? 'угода' : 'угод'}</span>
              <span>{result.tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length} відкритих задач</span>
              <span>{result.conversations.length} записів AI-історії</span>
            </div>
          </div>
        )}
      </div>
    </AgentWorkspaceShell>
  );
}
