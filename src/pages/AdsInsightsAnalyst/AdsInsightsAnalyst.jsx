import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fetchClientDirectory } from '../../lib/api/clients';
import { fetchConversations, fetchConversationMessages, createConversation, appendMessages } from '../../lib/api/aiConversations';
import { fetchFrameworks, createFramework, updateFramework, deleteFramework } from '../../lib/api/aiAuditFrameworks';
import { AGENT_ICONS, findAgentByKey } from '../../data/aiAgentsData';
import AgentOrb from '../../components/AgentOrb/AgentOrb';
import ChatMessage from './ChatMessage';
import AiaFrameworks from './AiaFrameworks';
import '../../styles/adsInsightsAnalystPage.css';

const AGENT_KEY = 'ads-insights-analyst';
const AGENT_COLOR = '#8B5CF6';
const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const SPARKLE_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>';
const CHEVRON_ICON = '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>';
const HISTORY_EMPTY_ICON = '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 3"/></svg>';
const FRAMEWORK_EMPTY_ICON = '<svg viewBox="0 0 24 24"><path d="M9 3h6l3 5-6 13L3 8z"/><path d="M3 8h18M9 3l3 5 3-5"/></svg>';

const ENV_LABELS = {
  GOOGLE_ADS_CLIENT_ID: 'GOOGLE_ADS_CLIENT_ID',
  GOOGLE_ADS_CLIENT_SECRET: 'GOOGLE_ADS_CLIENT_SECRET',
  GOOGLE_ADS_REFRESH_TOKEN: 'GOOGLE_ADS_REFRESH_TOKEN',
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
};

// One-click canned questions — each just sends its `prompt` through the
// same chat pipeline as manual typing, so there's no separate code path
// to keep in sync with what the backend tool can actually answer. `color`
// is a per-command accent for its icon chip only, purely decorative.
const HOTKEYS = [
  { label: 'Витрати', prompt: 'Скільки витрачено за останні 30 днів?', color: '#4F7CFF', icon: '<svg viewBox="0 0 24 24"><path d="M4 20V10m6 10V4m6 16v-7"/></svg>' },
  { label: 'Конверсії та ROAS', prompt: 'Скільки конверсій, яка їх цінність і ROAS за останні 30 днів?', color: '#EC4899', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>' },
  { label: 'Ціна за конверсію', prompt: 'Яка ціна за конверсію (CPA) за останні 30 днів?', color: '#38D9FF', icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3.2 6 1.6 6 4.7 0 1.4-1.3 2.5-3 2.5s-3-1.1-3-2.5"/></svg>' },
  { label: 'Всі показники', prompt: 'Покажи всі показники по кабінету за останні 30 днів', color: '#9B5CFF', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>' },
  { label: 'По кампаніях', prompt: 'Покажи розбивку по кампаніях за останні 30 днів', color: '#7C3AED', icon: '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg>' },
  { label: 'По пристроях', prompt: 'Покажи розбивку по пристроях (mobile/desktop/tablet) за останні 30 днів', color: '#4F7CFF', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="14" height="10" rx="1.5"/><path d="M8 20h6"/><rect x="18" y="8" width="4" height="9" rx="1"/></svg>' },
  { label: 'Impression share', prompt: 'Який impression share за останні 30 днів?', color: '#B879FF', icon: '<svg viewBox="0 0 24 24"><path d="M12 12V3a9 9 0 1 1-9 9z"/><path d="M12 12 21 8"/></svg>' },
  { label: 'Порівняти з минулим періодом', prompt: 'Порівняй останні 30 днів з попередніми 30 днями', color: '#9B5CFF', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' },
];

const SIDEBAR_TABS = [
  { key: 'commands', label: 'Команди' },
  { key: 'history', label: 'Історія' },
  { key: 'frameworks', label: 'Фреймворк' },
];

function formatHistoryDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

// Lives only inside the AI Agents map (ConstellationTest.jsx's
// ads-insights-analyst node), opened via `agentToolOpen` rather than a
// routed page. Renders as a fully opaque full-viewport workspace — never a
// translucent modal — so nothing of the map behind it is visible; closing
// (Back, X, or Escape — the last already handled by ConstellationTest)
// just unmounts this overlay, and the map underneath was never touched,
// so its focused department/view come back exactly as they were.
export default function AdsInsightsAnalyst({ onClose }) {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [error, setError] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('commands');
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [frameworks, setFrameworks] = useState([]);
  const [selectedFrameworkId, setSelectedFrameworkId] = useState(null);
  const threadRef = useRef(null);

  const agentData = findAgentByKey(AGENT_KEY);

  useEffect(() => {
    let alive = true;
    fetchClientDirectory().then((data) => {
      if (!alive) return;
      const withAds = data.filter((c) => c.google_ads_customer_id);
      setClients(withAds);
      if (withAds.length) setClientId(String(withAds[0].id));
    });
    return () => { alive = false; };
  }, []);

  // Frameworks are global to the agent (not per-client) — fetched once.
  useEffect(() => {
    fetchFrameworks(AGENT_KEY).then((data) => {
      setFrameworks(data);
      if (data.length && !selectedFrameworkId) setSelectedFrameworkId(data[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // A client switch always starts a blank chat — past dialogues for that
  // client are one click away in the Історія tab, not auto-resumed.
  useEffect(() => {
    if (!clientId) return;
    setMessages([]);
    setActiveConversationId(null);
    setConfigError(null);
    setError(null);
    fetchConversations(clientId, AGENT_KEY).then(setConversations);
  }, [clientId]);

  const selectedClient = clients?.find((c) => String(c.id) === String(clientId)) || null;

  function startNewConversation() {
    setMessages([]);
    setActiveConversationId(null);
    setConfigError(null);
    setError(null);
  }

  async function openConversation(conv) {
    const msgs = await fetchConversationMessages(conv.id);
    setMessages(msgs.map((m) => ({ role: m.role, content: m.content, visual: m.visual || undefined })));
    setActiveConversationId(conv.id);
    setConfigError(null);
    setError(null);
  }

  async function sendMessage(presetText, auditInstructions) {
    const text = (typeof presetText === 'string' ? presetText : input).trim();
    if (!text || !selectedClient || sending) return;
    setError(null);
    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/ads-insights-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ customerId: selectedClient.google_ads_customer_id, messages: nextMessages, auditInstructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка запиту');
      if (data.configError) {
        setConfigError(data.missing || []);
        setMessages(nextMessages);
        return;
      }
      const assistantMsg = { role: 'assistant', content: data.reply || '', visual: data.visual || undefined };
      setMessages([...nextMessages, assistantMsg]);

      // Persist this exchange — lazily create the conversation on its
      // first message, then keep appending to it. Best-effort: a save
      // failure shouldn't block the (already-shown) chat reply.
      try {
        let conversationId = activeConversationId;
        if (!conversationId) {
          const created = await createConversation(clientId, AGENT_KEY, text);
          conversationId = created.id;
          setActiveConversationId(conversationId);
          setConversations((cs) => [{ ...created }, ...cs]);
        } else {
          setConversations((cs) => cs.map((c) => (c.id === conversationId ? { ...c, updated_at: new Date().toISOString() } : c)));
        }
        await appendMessages(conversationId, [userMsg, assistantMsg]);
      } catch (saveErr) {
        console.warn('saving conversation failed', saveErr);
      }
    } catch (err) {
      console.warn('ads-insights-chat failed', err);
      setError('Не вдалося отримати відповідь. Спробуйте ще раз.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const selectedFramework = frameworks.find((f) => f.id === selectedFrameworkId) || null;

  // An audit is a one-shot deep dive, not a continuation of whatever
  // ad-hoc chat happened to be open — always starts a fresh conversation.
  function runAudit() {
    if (!selectedFramework || sending) return;
    setMessages([]);
    setActiveConversationId(null);
    sendMessage(`Провести аудит за фреймворком «${selectedFramework.name}»`, selectedFramework.instructions);
  }

  async function handleCreateFramework({ name, instructions }) {
    const created = await createFramework(AGENT_KEY, { name, instructions });
    setFrameworks((fs) => [...fs, created]);
    setSelectedFrameworkId(created.id);
  }

  async function handleUpdateFramework(id, { name, instructions }) {
    const updated = await updateFramework(id, { name, instructions });
    setFrameworks((fs) => fs.map((f) => (f.id === id ? updated : f)));
  }

  async function handleDeleteFramework(id) {
    if (!confirm('Видалити цей фреймворк аудиту?')) return;
    await deleteFramework(id);
    setFrameworks((fs) => fs.filter((f) => f.id !== id));
    if (selectedFrameworkId === id) setSelectedFrameworkId(null);
  }

  const loading = clients === null;

  return (
    <div className="aia-overlay">
      <div className="aia-topbar">
        <button type="button" className="aia-nav-pill" onClick={onClose}>
          <span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> До карти системи
        </button>
        <button type="button" className="aia-close-btn" onClick={onClose} aria-label="Закрити">
          <span dangerouslySetInnerHTML={{ __html: CLOSE_ICON }} />
        </button>
      </div>

      <div className="aia-panel">
        <div className="aia-panel-glow" />

        <div className="aia-header">
          <AgentOrb color={AGENT_COLOR} icon={AGENT_ICONS.ads} size={112} />
          <div className="aia-header-text">
            <div className="aia-kicker">AI-АГЕНТ · РЕКЛАМНА ЕФЕКТИВНІСТЬ</div>
            <h1>Аналітик рекламних даних та інсайтів</h1>
            {agentData?.description && <p className="aia-header-desc">{agentData.description}</p>}
          </div>
        </div>

        {loading && <div className="aia-empty">Завантаження…</div>}

        {!loading && !clients.length && (
          <div className="aia-empty">
            Жоден клієнт ще не має вказаного Google Ads Customer ID. Додайте його в профілі клієнта
            (розділ "Основна інформація"), щоб почати аналіз.
          </div>
        )}

        {!loading && clients.length > 0 && (
          <>
            <div className="aia-client-row">
              <label htmlFor="aia-client-select">Клієнт:</label>
              <select id="aia-client-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
              <span className="aia-client-id">{selectedClient?.google_ads_customer_id}</span>
            </div>

            <div className="aia-body">
              <div className="aia-chat-col">
                <div className="aia-thread" ref={threadRef}>
                  {!messages.length && (
                    <div className="aia-thread-hint-block">
                      <span className="aia-thread-hint-icon" dangerouslySetInnerHTML={{ __html: AGENT_ICONS.ads }} />
                      <div className="aia-thread-hint">
                        Запитайте природною мовою, наприклад: «Скільки витрачено за останні 30 днів?»
                        або «Покажи розбивку по кампаніях за цей місяць» — або скористайтесь швидкими командами праворуч.
                      </div>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <ChatMessage key={i} role={m.role} content={m.content} visual={m.visual} agentIcon={m.role === 'assistant' ? AGENT_ICONS.ads : undefined} />
                  ))}
                  {sending && (
                    <div className="aia-msg aia-msg-assistant">
                      <span className="aia-msg-avatar" dangerouslySetInnerHTML={{ __html: AGENT_ICONS.ads }} />
                      <div className="aia-msg-col">
                        <div className="aia-msg-bubble aia-msg-typing">Аналізую дані кабінету…</div>
                      </div>
                    </div>
                  )}
                  {configError && (
                    <div className="aia-config-error">
                      Google Ads ще не підключено на сервері. Потрібно додати в налаштуваннях Vercel:
                      <ul>{configError.map((k) => <li key={k}><code>{ENV_LABELS[k] || k}</code></li>)}</ul>
                    </div>
                  )}
                  {error && <div className="aia-config-error">{error}</div>}
                </div>

                <div className="aia-input-row">
                  <textarea
                    value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                    placeholder="Запитайте про показники цього кабінету…" rows={1} disabled={sending}
                  />
                  <button type="button" className="aia-send-btn" onClick={() => sendMessage()} disabled={sending || !input.trim()} aria-label="Надіслати">
                    <span dangerouslySetInnerHTML={{ __html: SEND_ICON }} />
                  </button>
                </div>
              </div>

              <aside className="aia-hotkeys">
                <button
                  type="button" className="aia-audit-btn" onClick={runAudit}
                  disabled={sending || !selectedFramework}
                  title={selectedFramework ? `Фреймворк: ${selectedFramework.name}` : 'Оберіть фреймворк у вкладці "Фреймворк"'}
                >
                  <span dangerouslySetInnerHTML={{ __html: SPARKLE_ICON }} />
                  <span className="aia-audit-btn-label">Провести аудит{selectedFramework ? ` — ${selectedFramework.name}` : ''}</span>
                </button>

                <div className="aia-sidebar-tabs" role="tablist">
                  {SIDEBAR_TABS.map((t) => (
                    <button
                      key={t.key} type="button" role="tab" aria-selected={sidebarTab === t.key}
                      className={'aia-sidebar-tab' + (sidebarTab === t.key ? ' active' : '')}
                      onClick={() => setSidebarTab(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="aia-sidebar-content" role="tabpanel">
                  {sidebarTab === 'commands' && HOTKEYS.map((hk) => (
                    <button key={hk.label} type="button" className="aia-hotkey-btn" style={{ '--hk-color': hk.color }} onClick={() => sendMessage(hk.prompt)} disabled={sending}>
                      <span className="aia-hotkey-icon" dangerouslySetInnerHTML={{ __html: hk.icon }} />
                      <span className="aia-hotkey-label">{hk.label}</span>
                      <span className="aia-hotkey-chevron" dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }} />
                    </button>
                  ))}

                  {sidebarTab === 'history' && (
                    <>
                      <button type="button" className="aia-new-convo-btn" onClick={startNewConversation}>
                        <span dangerouslySetInnerHTML={{ __html: PLUS_ICON }} /> Нова розмова
                      </button>
                      {!conversations.length && (
                        <div className="aia-panel-empty">
                          <span className="aia-panel-empty-icon" dangerouslySetInnerHTML={{ __html: HISTORY_EMPTY_ICON }} />
                          <div className="aia-panel-empty-title">Ще немає розмов</div>
                          <div className="aia-panel-empty-text">Ще немає збережених розмов з цим клієнтом.</div>
                        </div>
                      )}
                      {conversations.map((c) => (
                        <button
                          key={c.id} type="button"
                          className={'aia-history-item' + (activeConversationId === c.id ? ' active' : '')}
                          onClick={() => openConversation(c)}
                        >
                          <span className="aia-history-item-title">{c.title || 'Розмова'}</span>
                          <span className="aia-history-item-date">{formatHistoryDate(c.updated_at)}</span>
                        </button>
                      ))}
                    </>
                  )}

                  {sidebarTab === 'frameworks' && (
                    <AiaFrameworks
                      frameworks={frameworks} selectedId={selectedFrameworkId} onSelect={setSelectedFrameworkId}
                      onCreate={handleCreateFramework} onUpdate={handleUpdateFramework} onDelete={handleDeleteFramework}
                      emptyIcon={FRAMEWORK_EMPTY_ICON}
                    />
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
