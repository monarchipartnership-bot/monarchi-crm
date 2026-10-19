import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ActionIcon from '../../components/common/ActionIcon';
import Select from '../../components/common/Select';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import { fetchPipelines, fetchSiteLeads, fetchSiteLeadSettings, newSiteKey, saveSiteLeadSettings } from '../../lib/api/siteLeads';
import { copyToClipboard } from '../../lib/clipboard';
import { buildSnippet } from '../../lib/siteLeadSnippet';
import { fmtDateTime } from '../Smm/agentUi';
import TelegramPanel from './TelegramPanel';
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
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [missing, setMissing] = useState(false);

  const notify = useCallback((text, isError = false) => { setToast({ text, isError }); setTimeout(() => setToast(null), isError ? 7000 : 4000); }, []);
  const reload = useCallback(async () => {
    const [s, l, p] = await Promise.all([fetchSiteLeadSettings(), fetchSiteLeads(), fetchPipelines()]);
    if (!s) setMissing(true);
    setSettings(s); setLeads(l); setPipelines(p);
  }, []);
  useEffect(() => { reload(); fetchAllProfiles().then((p) => setPeople(p || [])); }, [reload]);

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

        <TelegramPanel settings={settings} leads={leads} patch={patch} notify={notify} busy={busy === 'save'} />

        <section className="smm-block">
          <h3>4. Що відбувається в CRM</h3>
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
          <h3>5. Код для сайту</h3>
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
