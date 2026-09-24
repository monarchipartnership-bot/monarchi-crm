import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fetchClientDirectory } from '../../lib/api/clients';
import { AGENT_ICONS } from '../../data/aiAgentsData';
import ChatMessage from './ChatMessage';
import '../../styles/adsInsightsAnalystPage.css';

const BACK_ICON = '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>';
const SEND_ICON = '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>';

const ENV_LABELS = {
  GOOGLE_ADS_CLIENT_ID: 'GOOGLE_ADS_CLIENT_ID',
  GOOGLE_ADS_CLIENT_SECRET: 'GOOGLE_ADS_CLIENT_SECRET',
  GOOGLE_ADS_REFRESH_TOKEN: 'GOOGLE_ADS_REFRESH_TOKEN',
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
};

// One-click canned questions — each just sends its `prompt` through the
// same chat pipeline as manual typing, so there's no separate code path
// to keep in sync with what the backend tool can actually answer.
const HOTKEYS = [
  { label: 'Витрати', prompt: 'Скільки витрачено за останні 30 днів?' },
  { label: 'Конверсії та ROAS', prompt: 'Скільки конверсій, яка їх цінність і ROAS за останні 30 днів?' },
  { label: 'Ціна за конверсію', prompt: 'Яка ціна за конверсію (CPA) за останні 30 днів?' },
  { label: 'Всі показники', prompt: 'Покажи всі показники по кабінету за останні 30 днів' },
  { label: 'По кампаніях', prompt: 'Покажи розбивку по кампаніях за останні 30 днів' },
  { label: 'По пристроях', prompt: 'Покажи розбивку по пристроях (mobile/desktop/tablet) за останні 30 днів' },
  { label: 'Impression share', prompt: 'Який impression share за останні 30 днів?' },
  { label: 'Порівняти з минулим періодом', prompt: 'Порівняй останні 30 днів з попередніми 30 днями' },
];

// Lives only inside the AI Agents map (ConstellationTest.jsx's
// ads-insights-analyst node) — same near-fullscreen overlay pattern as
// KnowledgeBase, opened via `agentToolOpen` rather than a routed page.
export default function AdsInsightsAnalyst({ onClose }) {
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [configError, setConfigError] = useState(null);
  const [error, setError] = useState(null);
  const threadRef = useRef(null);

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

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const selectedClient = clients?.find((c) => String(c.id) === String(clientId)) || null;

  async function sendMessage(presetText) {
    const text = (typeof presetText === 'string' ? presetText : input).trim();
    if (!text || !selectedClient || sending) return;
    setError(null);
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch('/api/ads-insights-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ customerId: selectedClient.google_ads_customer_id, messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Помилка запиту');
      if (data.configError) {
        setConfigError(data.missing || []);
        setMessages(nextMessages);
        return;
      }
      setMessages([...nextMessages, { role: 'assistant', content: data.reply || '' }]);
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

  const loading = clients === null;

  return (
    <div className="aia-overlay">
      <div className="aia-nav">
        <button type="button" className="aia-nav-pill" onClick={onClose}>
          <span dangerouslySetInnerHTML={{ __html: BACK_ICON }} /> До карти системи
        </button>
      </div>

      <div className="aia-panel">
        <div className="aia-panel-glow" />

        <div className="aia-header">
          <span className="aia-header-icon" dangerouslySetInnerHTML={{ __html: AGENT_ICONS.ads }} />
          <div className="aia-header-text">
            <div className="aia-kicker">AI-АГЕНТ · РЕКЛАМНА ЕФЕКТИВНІСТЬ</div>
            <h1>Аналітик рекламних даних та інсайтів</h1>
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
              <select id="aia-client-select" value={clientId} onChange={(e) => { setClientId(e.target.value); setMessages([]); setConfigError(null); }}>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
              </select>
              <span className="aia-client-id">{selectedClient?.google_ads_customer_id}</span>
            </div>

            <div className="aia-body">
              <div className="aia-chat-col">
                <div className="aia-thread" ref={threadRef}>
                  {!messages.length && (
                    <div className="aia-thread-hint">
                      Запитайте природною мовою, наприклад: «Скільки витрачено за останні 30 днів?»
                      або «Покажи розбивку по кампаніях за цей місяць» — або скористайтесь швидкими командами праворуч.
                    </div>
                  )}
                  {messages.map((m, i) => <ChatMessage key={i} role={m.role} content={m.content} />)}
                  {sending && (
                    <div className="aia-msg aia-msg-assistant">
                      <div className="aia-msg-bubble aia-msg-typing">Аналізую дані кабінету…</div>
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
                <div className="aia-hotkeys-title">Швидкі команди</div>
                {HOTKEYS.map((hk) => (
                  <button key={hk.label} type="button" className="aia-hotkey-btn" onClick={() => sendMessage(hk.prompt)} disabled={sending}>
                    {hk.label}
                  </button>
                ))}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
