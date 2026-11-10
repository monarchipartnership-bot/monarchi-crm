import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { savePrompt } from '../../../lib/api/agents';
import { dryRunAgent, fetchClientRequests, updateClientLink } from '../../../lib/api/deptAgents';
import { creativeRoleDef } from '../../../lib/agents/creativeTeam';
import Markdown from '../../Smm/Markdown';
import AgentPrompts from '../../Smm/AgentPrompts';
import AgentSettings from '../../Smm/AgentSettings';

const clientName = (c) => c.project?.name || c.campaign?.name || `Операція ${c.campaign_id}`;

// What the agent knows about ONE client: the card of the project is read automatically at every run; here are the client's own fields of this agent and
// the extra instruction for this client.
function ClientInfo({ agent, clients, reload, notify }) {
  const def = creativeRoleDef(agent.role);
  const [linkId, setLinkId] = useState(clients[0]?.id || null);
  const link = clients.find((c) => c.id === linkId) || clients[0] || null;
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues(link?.config || {}); }, [link?.id, link?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!clients.length) return <p className="smm-muted">Клієнтів ще немає: інформація зберігається окремо для кожного клієнта.</p>;
  const fields = [...(def?.clientFields || []), { key: 'extra', label: 'Додаткові вказівки для цього клієнта', type: 'textarea', rows: 3, hint: 'Додаються до промту агента лише для цього клієнта.' }];
  async function save() {
    setBusy(true);
    try { await updateClientLink(link.id, { config: values }); notify('Збережено.'); await reload(); } catch (e) { notify(e.message || 'Не вдалося зберегти.', true); } finally { setBusy(false); }
  }
  return (
    <>
      <div className="smm-field"><label htmlFor="dpt-client">Клієнт</label>
        <select id="dpt-client" className="dpt-select" value={link.id} onChange={(e) => setLinkId(Number(e.target.value))}>{clients.map((c) => <option key={c.id} value={c.id}>{clientName(c)}</option>)}</select>
        <span className="smm-hint">Картку проєкту (назва, сайт, країна, тип бізнесу, нотатки) агент читає сам при кожному запуску.</span>
      </div>
      {fields.map((f) => (
        <div className="smm-field smm-field--wide" key={f.key}>
          <label htmlFor={'dpt-f-' + f.key}>{f.label}</label>
          <textarea id={'dpt-f-' + f.key} rows={f.rows || 3} value={values[f.key] || ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} maxLength={3000} />
          {f.hint && <span className="smm-hint">{f.hint}</span>}
        </div>
      ))}
      <div className="smm-actions"><button type="button" className="smm-btn smm-btn--primary" disabled={busy} onClick={save}>{busy ? 'Зберігаємо…' : 'Зберегти'}</button></div>
    </>
  );
}

// «Trial run»: the agent works for a real client (and request) with the prompt text typed here, the result is shown (next to the saved version if asked)
// and saved nowhere. Only then the person decides to make the text a new version.
function PromptTest({ agent, clients, prompts, reload, notify }) {
  const { email } = useAuth();
  const current = prompts.find((p) => p.is_default) || prompts[0] || null;
  const [body, setBody] = useState(current?.body || '');
  const [campaignId, setCampaignId] = useState(clients[0]?.campaign_id || '');
  const [requests, setRequests] = useState([]);
  const [requestId, setRequestId] = useState('');
  const [compare, setCompare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const needsRequest = agent.role !== 'creative_analyst';
  useEffect(() => { setBody(current?.body || ''); }, [current?.id, current?.current_version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRequestId('');
    if (!campaignId || !needsRequest) { setRequests([]); return; }
    fetchClientRequests(Number(campaignId)).then((r) => { setRequests(r); setRequestId(r[0] ? String(r[0].id) : ''); }).catch(() => setRequests([]));
  }, [campaignId, needsRequest]);
  const changed = current && body.trim() !== current.body.trim();
  const calls = 1 + (compare && changed ? 1 : 0);
  const reason = !campaignId ? 'Оберіть клієнта.' : needsRequest && !requestId ? 'Для цього клієнта ще немає запиту, з даними якого агент міг би працювати.' : '';

  async function run() {
    setBusy(true); setResult(null);
    try {
      const mine = await dryRunAgent(agent.id, { campaignId: Number(campaignId), requestId: requestId ? Number(requestId) : null, promptBody: body });
      const base = compare && changed ? await dryRunAgent(agent.id, { campaignId: Number(campaignId), requestId: requestId ? Number(requestId) : null, promptBody: null }) : null;
      setResult({ mine, base });
    } catch (e) { notify(e.message || 'Пробний запуск не вдався.', true); } finally { setBusy(false); }
  }
  async function saveVersion() {
    setBusy(true);
    try { await savePrompt(current, { name: current.name, body, note: 'Після пробного запуску' }, email); notify('Збережено як нову версію поточного промту.'); setResult(null); await reload(); } catch (e) { notify(e.message || 'Не вдалося зберегти.', true); } finally { setBusy(false); }
  }
  if (!clients.length) return <p className="smm-muted">Для пробного запуску потрібен клієнт: підключіть його при створенні операції.</p>;
  return (
    <>
      <p className="smm-muted">Агент попрацює для обраного клієнта з текстом нижче й покаже результат. Нічого не зберігається, нічого не передається далі, у журнал не пишеться. Один пробний запуск це один виклик моделі, ≈ $0.02–0.05{calls > 1 ? ' (два з порівнянням)' : ''}.</p>
      <div className="smm-form">
        <div className="smm-field"><label htmlFor="dpt-t-client">Клієнт</label>
          <select id="dpt-t-client" className="dpt-select" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setResult(null); }}>{clients.map((c) => <option key={c.id} value={c.campaign_id}>{clientName(c)}</option>)}</select>
        </div>
        {needsRequest && (
          <div className="smm-field"><label htmlFor="dpt-t-req">Запит клієнта</label>
            <select id="dpt-t-req" className="dpt-select" value={requestId} onChange={(e) => { setRequestId(e.target.value); setResult(null); }}>{!requests.length && <option value="">немає запитів</option>}{requests.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>
          </div>
        )}
        <div className="smm-field smm-field--wide"><label htmlFor="dpt-t-body">Промт для проби</label>
          <textarea id="dpt-t-body" rows={8} value={body} onChange={(e) => { setBody(e.target.value); setResult(null); }} />
          <span className="smm-hint">{changed ? 'Текст відрізняється від поточної версії.' : 'Текст збігається з поточною версією.'}</span>
        </div>
        <label className="dpt-check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Показати поруч результат поточної версії для порівняння</label>
      </div>
      {reason && <p className="smm-note">{reason}</p>}
      <div className="smm-actions">
        <button type="button" className="smm-btn smm-btn--primary" disabled={busy || !!reason || !body.trim()} onClick={run}>{busy ? 'Агент працює…' : 'Пробний запуск'}</button>
        {result && changed && <button type="button" className="smm-btn" disabled={busy} onClick={saveVersion}>Зробити поточною (нова версія)</button>}
      </div>
      {result && (
        <div className={'dpt-compare' + (result.base ? ' has-base' : '')}>
          <article><h4>Ваш текст</h4><p className="smm-muted">Вартість проби: ${result.mine.cost.toFixed(3)}</p><Markdown text={result.mine.text} /></article>
          {result.base && <article><h4>Поточна версія</h4><p className="smm-muted">Вартість проби: ${result.base.cost.toFixed(3)}</p><Markdown text={result.base.text} /></article>}
        </div>
      )}
    </>
  );
}

export default function DeptSettings({ agent, team, clients, prompts, reload, notify }) {
  const loadPrompts = useMemo(() => reload, [reload]);
  return (
    <>
      <section className="smm-block"><h3>Загальні налаштування</h3><p className="smm-muted">Діють для всіх клієнтів агента.</p><AgentSettings agent={agent} notify={notify} reload={reload} /></section>
      <section className="smm-block"><h3>Що агент знає про клієнта</h3><ClientInfo agent={agent} clients={clients} reload={reload} notify={notify} /></section>
      <section className="smm-block"><h3>Промти й версії</h3><AgentPrompts agent={agent} prompts={prompts} reload={loadPrompts} notify={notify} /></section>
      <section className="smm-block"><h3>Пробний запуск промту</h3><PromptTest agent={agent} clients={clients} prompts={prompts} reload={reload} notify={notify} /></section>
    </>
  );
}
