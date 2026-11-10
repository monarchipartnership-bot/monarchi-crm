import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchAllProfiles } from '../../../lib/api/profile';
import { fetchAgentSettings, fetchAuditLog, fetchRights, saveApprovers, saveNotices } from '../../../lib/api/agentAudit';
import { fetchSystemState, restartStuck, sendTelegramTest } from '../../../lib/api/systemState';
import { AUDIT_LABELS, canEditApprovers } from '../../../lib/agents/rights';
import { OVERALL_TEXT, noticeDraft, noticesChanged, pickList } from '../../../lib/agents/settingsForm';
import '../../../styles/aiAgentsSection.css';
import '../../../styles/agentAnalyticsPage.css';
import '../../../styles/agentSpendPage.css';
import './SystemState.css';

const ICON = '<svg viewBox="0 0 24 24"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg>';
const DOT_TEXT = { ok: 'працює', warn: 'перевірте', bad: 'проблема' };
const fmtWhen = (iso) => new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// A list of people with check boxes (approvers, who gets the notices). A person who is not in the CRM any more stays in the list so that they can be removed.
function PeoplePick({ people, value, onChange, disabled, name }) {
  const set = new Set(value);
  const toggle = (e) => onChange(set.has(e) ? value.filter((x) => x !== e) : [...value, e]);
  return (
    <div className="sys-people" role="group" aria-label={name}>
      {people.map((p) => (
        <label key={p.email} className={'sys-person' + (set.has(p.email) ? ' on' : '')}>
          <input type="checkbox" checked={set.has(p.email)} disabled={disabled} onChange={() => toggle(p.email)} />
          <span>{p.label}{p.extra ? ' (немає в CRM)' : ''}</span>
          {p.label !== p.email && <small>{p.email}</small>}
        </label>
      ))}
    </div>
  );
}

// «Стан системи» — the one honest page of what keeps the AI agents working (the clock, the keys, the queue), who may start paid work and confirm results,
// where the notices go, and the journal of what people did (spec 2026-11-02, §7–§9).
export default function SystemState() {
  const { email } = useAuth();
  const [state, setState] = useState(null);
  const [stateError, setStateError] = useState('');
  const [settings, setSettings] = useState(undefined); // undefined = loading, null = no row
  const [rights, setRights] = useState({ approvers: [], isOps: false });
  const [profiles, setProfiles] = useState([]);
  const [journal, setJournal] = useState(null);
  const [approversDraft, setApproversDraft] = useState([]);
  const [draft, setDraft] = useState(noticeDraft(null));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ where: '', text: '', error: false });
  const say = (where, text, error = false) => setMsg({ where, text, error });

  const loadState = useCallback(async () => {
    setStateError('');
    try { setState(await fetchSystemState()); } catch (e) { setState(null); setStateError(e.message || 'Не вдалося перевірити стан.'); }
  }, []);
  const loadAll = useCallback(async () => {
    const [s, r, p, j] = await Promise.all([
      fetchAgentSettings().catch(() => null),
      fetchRights(email).catch(() => ({ approvers: [], isOps: false })),
      fetchAllProfiles().catch(() => []),
      fetchAuditLog({ limit: 40 }).catch(() => []),
    ]);
    setSettings(s); setRights(r); setProfiles(p); setJournal(j);
    setApproversDraft(r.approvers); setDraft(noticeDraft(s));
  }, [email]);
  useEffect(() => { loadState(); loadAll(); }, [loadState, loadAll]);

  const canEdit = canEditApprovers({ isOps: rights.isOps });
  const approverPeople = useMemo(() => pickList(profiles, approversDraft), [profiles, approversDraft]);
  const mailPeople = useMemo(() => pickList(profiles, draft.emails), [profiles, draft.emails]);
  const approversChanged = JSON.stringify([...approversDraft].sort()) !== JSON.stringify([...rights.approvers].sort());
  const upd = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  async function onSaveApprovers() {
    setBusy('approvers'); say('', '');
    try {
      const saved = await saveApprovers(approversDraft);
      setRights((r) => ({ ...r, approvers: saved })); setApproversDraft(saved);
      say('approvers', saved.length ? 'Список збережено.' : 'Список порожній: запускати й утверджувати може будь-хто з доступом.');
      fetchAuditLog({ limit: 40 }).then(setJournal).catch(() => null);
    } catch (e) { say('approvers', e.message || 'Не вдалося зберегти.', true); } finally { setBusy(''); }
  }
  async function onRestartStuck() {
    setBusy('stuck'); say('', '');
    try { const n = await restartStuck(); say('checks', n ? `Перезапущено агентів: ${n}. Їхні завдання знову в черзі.` : 'Зависших завдань не знайдено.'); await loadState(); } catch (e) { say('checks', e.message || 'Не вдалося перезапустити.', true); } finally { setBusy(''); }
  }
  async function onTelegramTest(thread) {
    setBusy('tg' + thread); say('', '');
    try { await sendTelegramTest(thread); say('notices', 'Тестове повідомлення надіслано: перевірте гілку в Telegram.'); } catch (e) { say('notices', e.message || 'Не вдалося надіслати.', true); } finally { setBusy(''); }
  }
  async function onSaveNotices() {
    setBusy('notices'); say('', '');
    try {
      const saved = await saveNotices(draft, email);
      setSettings(saved); setDraft(noticeDraft(saved));
      say('notices', 'Сповіщення збережено.');
      loadState();
    } catch (e) { say('notices', e.message || 'Не вдалося зберегти.', true); } finally { setBusy(''); }
  }

  const overall = state?.status;
  const bad = (state?.checks || []).filter((c) => c.status !== 'ok');
  const good = (state?.checks || []).filter((c) => c.status === 'ok');
  const note = (where) => msg.where === where && msg.text && <p className={'sys-msg' + (msg.error ? ' bad' : '')} role={msg.error ? 'alert' : 'status'}>{msg.text}</p>;

  return (
    <div className="ai-section spend-page sys-page">
      <div className="ai-section-head">
        <span className="ai-section-icon" dangerouslySetInnerHTML={{ __html: ICON }} />
        <div>
          <div className="ai-section-kicker">AI AGENTS</div>
          <h1>Стан системи</h1>
          <p>Чи працюють годинник агентів, ключі й черга; хто може запускати платне й утверджувати результати; куди йдуть сповіщення; що робили люди.</p>
        </div>
      </div>

      <div className="analytics-section">
        <div className="sys-top">
          <h2 className="analytics-section-title">Перевірка</h2>
          <button type="button" className="ai-section-btn" onClick={loadState}>Перевірити ще раз</button>
        </div>
        {!state && !stateError && <div className="ai-section-empty">Перевіряю…</div>}
        {stateError && <div className="ai-section-empty sys-bad" role="alert">{stateError}</div>}
        {state && (
          <>
            <div className={'sys-overall s-' + overall} role="status"><i aria-hidden="true" />{OVERALL_TEXT[overall]}</div>
            {bad.length > 0 && <ul className="sys-checks">{bad.map((c) => <li key={c.key} className={'s-' + c.status}><i aria-hidden="true" /><div><b>{c.label}</b><span>{c.detail}</span></div><em>{DOT_TEXT[c.status]}</em></li>)}</ul>}
            {good.length > 0 && (
              <details className="sys-ok">
                <summary>Працює: {good.length} з {state.checks.length}</summary>
                <ul className="sys-checks">{good.map((c) => <li key={c.key} className="s-ok"><i aria-hidden="true" /><div><b>{c.label}</b><span>{c.detail}</span></div><em>{DOT_TEXT.ok}</em></li>)}</ul>
              </details>
            )}
            {state.checks.some((c) => c.key === 'stuck' && c.status !== 'ok') && <div className="sys-actions"><button type="button" className="ai-section-btn ai-section-btn-primary" disabled={busy === 'stuck'} onClick={onRestartStuck}>{busy === 'stuck' ? '…' : 'Перезапустити зависші'}</button></div>}
            {note('checks')}
            <p className="analytics-note">Значень ключів тут немає й бути не може: сторінка знає лише, чи ключ задано на сервері. Задати чи змінити ключ — у налаштуваннях проєкту на Vercel.</p>
          </>
        )}
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Хто може запускати платне й утверджувати</h2>
        {settings === undefined && <div className="ai-section-empty">Завантаження…</div>}
        {settings !== undefined && (
          <>
            <p className="analytics-note sys-lead">Платне — запуск операції й креативів, повтори, ручні запуски агентів. Утвердження — підтвердження результатів і планів. {approversDraft.length ? `Зараз можуть лише: ${approversDraft.length} ${approversDraft.length === 1 ? 'особа' : 'осіб'} (і операційні менеджери).` : 'Список порожній: може будь-хто з доступом до CRM.'}</p>
            <PeoplePick people={approverPeople} value={approversDraft} onChange={setApproversDraft} disabled={!canEdit || busy === 'approvers'} name="Утверджувачі" />
            {canEdit ? (
              <div className="sys-actions">
                <button type="button" className="ai-section-btn ai-section-btn-primary" disabled={!approversChanged || busy === 'approvers'} onClick={onSaveApprovers}>{busy === 'approvers' ? '…' : 'Зберегти список'}</button>
                {approversDraft.length > 0 && <button type="button" className="ai-section-btn" disabled={busy === 'approvers'} onClick={() => setApproversDraft([])}>Очистити (дозволити всім)</button>}
              </div>
            ) : <p className="analytics-note">Список змінюють лише операційні менеджери.</p>}
            {note('approvers')}
          </>
        )}
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Сповіщення</h2>
        {settings === undefined && <div className="ai-section-empty">Завантаження…</div>}
        {settings === null && <div className="ai-section-empty sys-bad" role="alert">Рядок налаштувань не знайдено: потрібні міграції агентів.</div>}
        {settings && (
          <>
            <label className="sys-switch"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} /><span>Надсилати сповіщення про витрати й про те, що агенти чекають вас</span></label>
            <div className="sys-form">
              <label>Чат Telegram<input type="text" value={draft.chat} onChange={upd('chat')} placeholder="-1001234567890" inputMode="text" /></label>
              <label>Гілка «AI Agents: потрібна увага»<input type="text" value={draft.attention} onChange={upd('attention')} placeholder="номер гілки" inputMode="numeric" /></label>
              <label>Гілка «AI Agents: витрати»<input type="text" value={draft.spend} onChange={upd('spend')} placeholder="номер гілки" inputMode="numeric" /></label>
              <label>Година денного підсумку (Київ)<input type="text" value={draft.hour} onChange={upd('hour')} inputMode="numeric" /></label>
            </div>
            <p className="analytics-note">Лишіть чат порожнім, якщо Telegram не потрібен: сповіщення підуть лише в дзвінок CRM. Номер гілки — число в посиланні на повідомлення в ній: t.me/c/…/<b>гілка</b>/повідомлення. Без Telegram-токена на сервері повідомлення в Telegram не надсилаються.</p>
            <h3 className="sys-sub">Хто отримує сповіщення в CRM</h3>
            <PeoplePick people={mailPeople} value={draft.emails} onChange={(emails) => setDraft((d) => ({ ...d, emails }))} disabled={busy === 'notices'} name="Отримувачі сповіщень" />
            <div className="sys-actions">
              <button type="button" className="ai-section-btn ai-section-btn-primary" disabled={!noticesChanged(draft, settings) || busy === 'notices'} onClick={onSaveNotices}>{busy === 'notices' ? '…' : 'Зберегти сповіщення'}</button>
              <button type="button" className="ai-section-btn" disabled={!settings.tg_chat_id || !!busy} onClick={() => onTelegramTest('attention')} title={settings.tg_chat_id ? undefined : 'Спершу збережіть чат Telegram'}>{busy === 'tgattention' ? '…' : 'Тест: «потрібна увага»'}</button>
              <button type="button" className="ai-section-btn" disabled={!settings.tg_chat_id || !!busy} onClick={() => onTelegramTest('spend')} title={settings.tg_chat_id ? undefined : 'Спершу збережіть чат Telegram'}>{busy === 'tgspend' ? '…' : 'Тест: «витрати»'}</button>
            </div>
            {note('notices')}
          </>
        )}
      </div>

      <div className="analytics-section">
        <h2 className="analytics-section-title">Журнал дій</h2>
        {journal === null && <div className="ai-section-empty">Завантаження…</div>}
        {journal && !journal.length && <div className="ai-section-empty">Записів ще немає.</div>}
        {journal && journal.length > 0 && (
          <div className="spend-table-wrap">
            <table className="spend-table">
              <thead><tr><th>Коли</th><th>Хто</th><th>Дія</th><th>Що саме</th></tr></thead>
              <tbody>
                {journal.map((r) => (
                  <tr key={r.id} className={r.action === 'denied' ? 'sys-denied' : ''}>
                    <td>{fmtWhen(r.at)}</td><td>{r.actor || 'система'}</td><td>{AUDIT_LABELS[r.action] || r.subject || r.action}</td><td className="sys-sum">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
