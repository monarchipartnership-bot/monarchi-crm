import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { fetchPipelines, fetchSiteLeads, fetchSiteLeadSettings, newSiteKey, saveSiteLeadSettings, telegramChats, telegramStatus, telegramTest } from '../../lib/api/siteLeads';
import { copyToClipboard } from '../../lib/clipboard';
import { buildSnippet } from '../../lib/siteLeadSnippet';
import { fmtDateTime } from '../Smm/agentUi';
import '../../styles/projectWorkspace.css'; // the confirmation window lives in this sheet
import '../../styles/smmPage.css';

const ENDPOINT = 'https://crm.monarchi.agency/api/site-lead';
const STATUS = { new: ['Створено', 'ok'], duplicate: ['Дубль', 'wait'], spam: ['Спам', 'off'], error: ['Помилка', 'bad'] };
const TG = { sent: 'надіслано', failed: 'не надіслано', skipped: 'не налаштовано' };

// «Заявки з сайту»: the form of the website → a contact and a deal in the CRM + a message in Telegram. Everything is set up here.
export default function SiteLeads() {
  const { email } = useAuth();
  const [confirm, confirmDialog] = useConfirm();
  const [settings, setSettings] = useState(null);
  const [leads, setLeads] = useState([]);
  const [pipelines, setPipelines] = useState([]);
  const [people, setPeople] = useState([]);
  const [bot, setBot] = useState(null); // { tokenSet, ok, bot, error }
  const [found, setFound] = useState(null);
  const [manualChat, setManualChat] = useState('');
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [missing, setMissing] = useState(false);

  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4000); }, []);
  const reload = useCallback(async () => {
    const [s, l, p] = await Promise.all([fetchSiteLeadSettings(), fetchSiteLeads(), fetchPipelines()]);
    if (!s) setMissing(true);
    setSettings(s); setLeads(l); setPipelines(p);
  }, []);
  useEffect(() => { reload(); fetchAllProfiles().then((p) => setPeople(p || [])); telegramStatus().then(setBot).catch((e) => setBot({ unreachable: true, error: e.message })); }, [reload]);

  const snippet = useMemo(() => (settings ? buildSnippet({ endpoint: ENDPOINT, key: settings.site_key }) : ''), [settings]);
  const week = Date.now() - 7 * 86400000;
  const stats = useMemo(() => {
    const w = leads.filter((l) => new Date(l.received_at).getTime() >= week);
    return { week: w.length, deals: w.filter((l) => l.status === 'new').length, problems: leads.filter((l) => l.status === 'error' || l.telegram_status === 'failed').length };
  }, [leads, week]);

  async function patch(p, okText) {
    setBusy('save');
    try { setSettings(await saveSiteLeadSettings(p, email)); if (okText) notify(okText); } catch (e) { notify(e.message || 'Не вдалося зберегти.', true); } finally { setBusy(''); }
  }
  const addChat = (id, title) => { const c = String(id).trim(); if (!c) return; if ((settings.telegram_chat_ids || []).includes(c)) { notify('Цей чат уже додано.', true); return; } patch({ telegram_chat_ids: [...(settings.telegram_chat_ids || []), c] }, `Чат додано${title ? ': ' + title : ''}.`); setManualChat(''); };
  const removeChat = (c) => patch({ telegram_chat_ids: settings.telegram_chat_ids.filter((x) => x !== c) }, 'Чат прибрано.');
  async function test(c) {
    setBusy('test' + c);
    try { await telegramTest(c); notify('Тестове повідомлення надіслано: перевірте чат.'); } catch (e) { notify(e.message || 'Не вдалося надіслати.', true); } finally { setBusy(''); }
  }
  async function findChats() {
    setBusy('find');
    try { const r = await telegramChats(); setFound(r.chats || []); if (!(r.chats || []).length) notify('Бот ще не бачив жодного чату: додайте його в чат і напишіть там повідомлення.', true); } catch (e) { notify(e.message || 'Не вдалося отримати чати.', true); } finally { setBusy(''); }
  }
  async function rotateKey() {
    if (!(await confirm({ title: 'Згенерувати новий ключ?', body: 'Старий скрипт на сайті одразу перестане приймати заявки. Новий код треба буде вставити на сайт.', confirmLabel: 'Згенерувати' }))) return;
    patch({ site_key: newSiteKey() }, 'Новий ключ створено: оновіть код на сайті.');
  }
  const toggleEmail = (e) => patch({ notify_emails: settings.notify_emails.includes(e) ? settings.notify_emails.filter((x) => x !== e) : [...settings.notify_emails, e] });

  if (missing) return <div className="smm-page"><div className="smm-sheet"><div className="smm-empty smm-empty--big" role="alert">Таблиці ще не створено. Потрібно застосувати міграцію <code>20261024000000_site_leads.sql</code>.</div></div></div>;
  if (!settings) return <div className="smm-page"><div className="smm-sheet"><p className="smm-muted">Завантаження…</p></div></div>;
  const pipeOptions = pipelines.map((p) => ({ value: String(p.id), label: p.name }));

  return (
    <div className="smm-page" data-dd="plum">
      <div className="smm-sheet">
        {toast && <div className={'smm-toast' + (toast.isError ? ' is-error' : '')} role="status">{toast.text}</div>}

        <div className="smm-block-head">
          <div><h3>Заявки з сайту</h3><p className="smm-muted">Клієнт заповнює форму на сайті, і заявка сама зʼявляється в CRM як контакт та угода, а в Telegram приходить повідомлення.</p></div>
          <label className="smm-switch"><input type="checkbox" checked={settings.enabled} onChange={(e) => patch({ enabled: e.target.checked }, e.target.checked ? 'Приймання заявок увімкнено.' : 'Приймання заявок вимкнено: нові заявки ігноруються.')} disabled={busy === 'save'} /><span>{settings.enabled ? 'Приймаємо заявки' : 'Вимкнено'}</span></label>
        </div>

        <div className="smm-stats">
          <div className="smm-stat"><b>{stats.week}</b><span>заявок за 7 днів</span></div>
          <div className="smm-stat"><b>{stats.deals}</b><span>з них стали угодами</span></div>
          <div className={'smm-stat' + (stats.problems ? ' smm-stat--bad' : '')}><b>{stats.problems}</b><span>проблем (помилка або Telegram не доставив)</span></div>
        </div>

        <section className="smm-block">
          <h3>1. Telegram</h3>
          {bot?.unreachable && <p className="smm-warn-banner" role="status">Не вдалося перевірити бота: {bot.error} Це не означає, що бота не підключено. Відкрийте цю сторінку на робочому сайті (crm.monarchi.agency): на локальному сервері серверні функції та токен бота недоступні.</p>}
          {bot && !bot.unreachable && !bot.tokenSet && (
            <div className="smm-warn-banner" role="status">
              <b>Бота ще не підключено.</b> Зробіть чотири кроки:
              <ol className="smm-howto">
                <li>У Telegram відкрийте <b>@BotFather</b>, надішліть <code>/newbot</code>, придумайте імʼя й скопіюйте токен.</li>
                <li>У Vercel: проєкт → Settings → Environment Variables → додайте <code>TELEGRAM_BOT_TOKEN</code> (Production) і перезапустіть деплой. Токен нікому не надсилайте, у чат теж.</li>
                <li>Додайте бота в потрібний чат чи групу й напишіть там будь-яке повідомлення.</li>
                <li>Поверніться сюди й натисніть «Знайти чати».</li>
              </ol>
            </div>
          )}
          {bot?.tokenSet && bot.ok && <p className="smm-note">Бот <b>@{bot.bot?.username}</b> підключено. Додайте його в чат, напишіть там повідомлення й натисніть «Знайти чати».</p>}
          {bot?.tokenSet && !bot.ok && <p className="smm-error">Токен є, але Telegram його не прийняв: {bot.error}</p>}

          <div className="smm-list">
            {(settings.telegram_chat_ids || []).map((c) => (
              <div key={c} className="smm-row">
                <span className="smm-row-title"><b>Чат {c}</b></span>
                <button type="button" className="smm-btn" disabled={!bot?.ok || busy === 'test' + c} onClick={() => test(c)}>{busy === 'test' + c ? 'Надсилаємо…' : 'Надіслати тест'}</button>
                <button type="button" className="smm-btn smm-btn--danger" onClick={() => removeChat(c)}>Прибрати</button>
              </div>
            ))}
            {!(settings.telegram_chat_ids || []).length && <p className="smm-empty">Чатів ще немає: заявки приходитимуть лише в CRM.</p>}
          </div>
          <div className="smm-form-foot">
            <button type="button" className="smm-btn" disabled={!bot?.ok || busy === 'find'} onClick={findChats}><ActionIcon name="search" size={18} />{busy === 'find' ? 'Шукаємо…' : 'Знайти чати'}</button>
            <input className="smm-input-inline" type="text" value={manualChat} onChange={(e) => setManualChat(e.target.value)} placeholder="або вставте chat id, напр. -1001234567890" aria-label="Chat id" />
            <button type="button" className="smm-btn" disabled={!manualChat.trim()} onClick={() => addChat(manualChat)}>Додати</button>
          </div>
          {found && found.length > 0 && (
            <div className="smm-list">
              {found.map((c) => (
                <div key={c.id} className="smm-row">
                  <span className="smm-row-title"><b>{c.title}</b><span className="smm-muted">{c.type} · {c.id}</span></span>
                  <button type="button" className="smm-btn smm-btn--primary" onClick={() => addChat(c.id, c.title)} disabled={(settings.telegram_chat_ids || []).includes(c.id)}>{(settings.telegram_chat_ids || []).includes(c.id) ? 'Додано' : 'Додати'}</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="smm-block">
          <h3>2. Що відбувається в CRM</h3>
          <div className="smm-form">
            <div className="smm-field"><label>Воронка для нових угод</label><Select value={String(settings.pipeline_id || '')} onChange={(v) => patch({ pipeline_id: Number(v) }, 'Воронку збережено.')} options={pipeOptions} placeholder="Website" ariaLabel="Воронка" /></div>
            <div className="smm-field"><label>Менеджер за замовчуванням</label><Select value={settings.manager || ''} onChange={(v) => patch({ manager: v || null }, 'Менеджера збережено.')} options={[{ value: '', label: 'Без менеджера' }, ...people.map((p) => ({ value: profileLabel(p), label: profileLabel(p) }))]} ariaLabel="Менеджер" /></div>
            <fieldset className="smm-field smm-field--wide">
              <legend>Кому показувати нову заявку в CRM (дзвіночок)</legend>
              <div className="smm-people">
                {people.map((p) => { const e = String(p.email).toLowerCase(); return <label key={e} className="smm-check"><input type="checkbox" checked={(settings.notify_emails || []).includes(e)} onChange={() => toggleEmail(e)} /> {profileLabel(p)}</label>; })}
              </div>
            </fieldset>
          </div>
          <p className="smm-muted">Нова заявка: контакт (джерело «Website», статус «Новий») і угода на першому етапі воронки. Якщо клієнт із таким e-mail чи телефоном уже є, нова угода відкривається на нього, а дубль протягом 10 хвилин ігнорується.</p>
        </section>

        <section className="smm-block">
          <h3>3. Код для сайту</h3>
          <p className="smm-muted">Скрипт вставляється на сайт один раз і надсилає копію кожної заявки в CRM, а форма сайту працює як раніше. Сайт на WordPress: плагін «WPCode» або «Insert Headers and Footers» → блок «Footer» → вставити код → зберегти. Або вставте перед <code>&lt;/body&gt;</code> у темі сайту.</p>
          <textarea className="smm-code" readOnly rows={12} value={snippet} onFocus={(e) => e.target.select()} aria-label="Код для сайту" />
          <div className="smm-form-foot">
            <button type="button" className="smm-btn smm-btn--primary" onClick={async () => { try { await copyToClipboard(snippet); notify('Код скопійовано.'); } catch { notify('Не вдалося скопіювати.', true); } }}><ActionIcon name="copy" size={18} />Копіювати код</button>
            <button type="button" className="smm-btn" onClick={rotateKey} disabled={busy === 'save'}>Згенерувати новий ключ</button>
            <span className="smm-muted">Приймаємо лише з: {(settings.allowed_origins || []).join(', ')}</span>
          </div>
        </section>

        <section className="smm-block">
          <h3>Останні заявки</h3>
          {!leads.length && <p className="smm-empty smm-empty--big">Заявок ще не було. Після вставки коду надішліть тестову заявку з форми сайту.</p>}
          <div className="smm-list">
            {leads.map((l) => {
              const [label, tone] = STATUS[l.status] || [l.status, 'off'];
              return (
                <div key={l.id} className="smm-row">
                  <span className="smm-row-title"><b>{l.name || l.email || l.phone}</b><span className="smm-muted">{[l.email, l.phone, (l.services || []).join(', ')].filter(Boolean).join(' · ')}</span>{l.message && <span className="smm-muted smm-clamp">{l.message}</span>}{l.error && <span className="smm-bad">{l.error}</span>}</span>
                  <span className="smm-muted">{fmtDateTime(l.received_at)}</span>
                  <span className={'smm-state smm-state--' + tone}>{label}</span>
                  {l.telegram_status && <span className={'smm-pill' + (l.telegram_status === 'failed' ? ' smm-pill--bad' : '')} title={l.telegram_error || undefined}>Telegram: {TG[l.telegram_status]}</span>}
                  {l.deal_id && <Link className="smm-link" to={`/reports/deals?open=${l.deal_id}`}>Відкрити угоду</Link>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {confirmDialog}
    </div>
  );
}
