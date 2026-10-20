import { useEffect, useMemo, useRef, useState } from 'react';
import ClientPicker from '../Clients/ClientPicker';
import AdAccountPicker from './AdAccountPicker';
import Select from '../common/Select';
import { SERVICES } from '../../lib/projectConstants';
import { EXTRA_PROJECT_FIELDS, extraFieldsForm, extraFieldsPayload } from '../../lib/projectFields';
import { AD_PLATFORMS, platformInfo } from '../../lib/adAccounts';
import { PAGE_ICONS, PLATFORM_ICONS, PLATFORM_SYMBOL, SERVICE_SYMBOL } from '../../lib/pageIcons';
import { fetchAllProjectAccounts } from '../../lib/api/projectAccounts';
import { fetchClientById } from '../../lib/api/clients';
import { clientFullName } from '../../lib/clientName';
import { COUNTRIES } from '../../lib/countries';
import '../../styles/projectAccounts.css';
import DatePicker from '../common/DatePicker';
import { dropdownOpen } from '../../lib/useDialogA11y';

const EMPTY_FORM = { name: '', manager: '', start_date: '', end_date: '', client: '', country: '', website: '', services: [], ...extraFieldsForm(null) };
// Small line icons for the dialog buttons (stroke follows the button text colour).
const BTN_ICONS = {
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};
const BtnIcon = ({ name }) => <svg className="pf-ic" viewBox="0 0 24 24" aria-hidden="true">{BTN_ICONS[name]}</svg>;
// The four sections of the dialog: a side rail of ring medallions switches between them (Hub style).
const SECTIONS = [
  { key: 'acc', title: 'Рекламні кабінети', icon: <path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0zM12 16v5" /> },
  { key: 'main', title: 'Основне', icon: <><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14H6z" /><path d="M9 11h6M9 15h4" /></> },
  { key: 'more', title: 'Додатково', icon: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z" /></> },
  { key: 'reg', title: 'Реєстр проєкту', icon: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M4 10h16M10 5v14" /></> },
];
const SERVICE_LINE = {
  'TikTok Ads': <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.5 2.5 2 4 4.5 4.5" />,
  SEO: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.5-4.5M9 11.5l1.5 1.5 3-3" /></>,
  'AI Development': <><rect x="6" y="6" width="12" height="12" rx="3" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
  'Web Development': <path d="M9 8l-5 4 5 4M15 8l5 4-5 4M13.5 5l-3 14" />,
  'Email Marketing': <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
  'Content Marketing': <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
};
function ServiceIcon({ name }) {
  const sym = SERVICE_SYMBOL[name] && PLATFORM_ICONS[SERVICE_SYMBOL[name]];
  if (sym) return <img src={sym.src} alt="" draggable="false" />;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{SERVICE_LINE[name]}</svg>;
}
const PLATFORM_OPTIONS = AD_PLATFORMS.map((p) => ({ value: p.key, label: p.label }));

let rowSeq = 1;
const newRow = (platform) => ({ key: rowSeq++, platform, account: null });

// "+ Створити проект": a project is started from its ad account(s) — pick the
// platform and the account and the name, currency and time zone come from the
// account; the client is chosen from (or created in) the CRM contacts. A project
// can carry one account per platform (e.g. Meta and Google together), or none
// for work that has no ad account (SEO, development, ...). Everything else lives
// on the project page once it exists.
export default function ProjectModal({ onClose, onSave, saving, initialClientId }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameTouched, setNameTouched] = useState(false);
  const [rows, setRows] = useState(() => [newRow('meta')]);
  const [clientId, setClientId] = useState(initialClientId || null);
  const [usedKeys, setUsedKeys] = useState(() => new Set());
  const [error, setError] = useState('');
  const [section, setSection] = useState('acc');
  const boxRef = useRef(null);

  // Escape closes without creating anything; Tab / Shift+Tab stay inside the dialog.
  useEffect(() => {
    boxRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { if (dropdownOpen()) return; e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && (document.activeElement === f[0] || document.activeElement === boxRef.current)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    fetchAllProjectAccounts().then((all) => setUsedKeys(new Set(all.map((a) => `${a.platform}:${a.account_id}`))));
  }, []);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleService(s) {
    setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }));
  }

  // Fill what the contact already knows, never overwriting what was typed.
  function applyClient(client) {
    if (!client) { setClientId(null); setForm((f) => ({ ...f, client: '' })); return; }
    setClientId(client.id);
    const countryName = COUNTRIES.find((c) => c.code === client.country)?.name || '';
    setForm((f) => ({
      ...f,
      client: client.company || clientFullName(client),
      country: f.country || countryName,
      business_type: f.business_type || client.business_category || '',
    }));
  }

  useEffect(() => {
    if (initialClientId) fetchClientById(initialClientId).then((c) => { if (c) applyClient(c); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRowPlatform(key, platform) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, platform, account: null } : r)));
  }

  function setRowAccount(key, account) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, account } : r)));
    if (!account) return;
    const service = platformInfo(rows.find((r) => r.key === key)?.platform).service;
    setForm((f) => ({
      ...f,
      name: nameTouched || f.name ? f.name : (account.name || ''),
      services: service && !f.services.includes(service) ? [...f.services, service] : f.services,
    }));
  }

  const freePlatform = useMemo(() => AD_PLATFORMS.find((p) => !rows.some((r) => r.platform === p.key)), [rows]);

  function addRow() {
    if (freePlatform) setRows((rs) => [...rs, newRow(freePlatform.key)]);
  }

  function handleSave() {
    const name = form.name.trim();
    if (!name) { setError('Введіть назву проєкту.'); setSection('main'); return; }
    if (rows.some((r) => !r.account)) { setError('Оберіть кабінет у кожному рядку або приберіть порожній рядок.'); setSection('acc'); return; }
    setError('');
    onSave({
      project: {
        name,
        manager: form.manager.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        services: form.services,
        client: form.client.trim() || null,
        client_id: clientId || null,
        country: form.country.trim() || null,
        website: form.website.trim() || null,
        ...extraFieldsPayload(form),
      },
      accounts: rows.map((r) => ({ platform: r.platform, account: r.account })),
    });
  }

  // Up / Down / Home / End move between the sections on the rail.
  function onRailKey(e) {
    const keys = SECTIONS.map((x) => x.key);
    const i = keys.indexOf(section);
    let next = null;
    if (e.key === 'ArrowDown') next = keys[(i + 1) % keys.length];
    else if (e.key === 'ArrowUp') next = keys[(i - 1 + keys.length) % keys.length];
    else if (e.key === 'Home') next = keys[0];
    else if (e.key === 'End') next = keys[keys.length - 1];
    if (!next) return;
    e.preventDefault();
    setSection(next);
    boxRef.current?.querySelector('#pmh-nav-' + next)?.focus();
  }

  const sectionTitle = SECTIONS.find((x) => x.key === section)?.title;

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} data-dd="hub" className="modal-box pacc-modal proj-modal-folder pmh-dialog" role="dialog" aria-modal="true" aria-label="Створити проєкт" tabIndex={-1}>
        <aside className="pmh-rail">
          <div className="pmh-brand">
            <span className="pmh-md pmh-md--lg"><span className="pmh-mi"><img src={PAGE_ICONS['page.projects'].src} alt="" draggable="false" /></span></span>
            <div><b>Новий проєкт</b><small>{SECTIONS.length} розділи</small></div>
          </div>
          <div className="pmh-nav" role="tablist" aria-orientation="vertical" aria-label="Розділи форми" onKeyDown={onRailKey}>
            {SECTIONS.map((x) => (
              <button
                key={x.key} id={'pmh-nav-' + x.key} type="button" role="tab" aria-selected={section === x.key} aria-controls={'pmh-pane-' + x.key}
                tabIndex={section === x.key ? 0 : -1} className={'pmh-rn' + (section === x.key ? ' on' : '')} onClick={() => setSection(x.key)}
              >
                <span className="pmh-md"><span className="pmh-mi pmh-mi--ln"><svg viewBox="0 0 24 24" aria-hidden="true">{x.icon}</svg></span></span>
                {x.title}
              </button>
            ))}
          </div>
          <div className="pmh-note">Обовʼязкова лише назва проєкту. Решту можна дозаповнити пізніше на сторінці проєкту.</div>
        </aside>
        <div className="pmh-main">
          <div className="modal-head">
            <div><h3 id="proj-modal-title">{sectionTitle}</h3><small>Створити проєкт</small></div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
          <div className="modal-body">
            <section id="pmh-pane-acc" role="tabpanel" aria-labelledby="pmh-nav-acc" hidden={section !== 'acc'}>
              <div className="pacc-rows">
                {rows.map((r) => {
                  const sym = PLATFORM_ICONS[PLATFORM_SYMBOL[r.platform]];
                  return (
                    <div className="pacc-row" key={r.key}>
                      <div className="pacc-row-head">
                        <span className="pmh-md pmh-md--row"><span className="pmh-mi">{sym && <img src={sym.src} alt="" draggable="false" />}</span></span>
                        <div className="pacc-row-platform">
                          <Select value={r.platform} onChange={(v) => setRowPlatform(r.key, v)} options={PLATFORM_OPTIONS.filter((o) => o.value === r.platform || !rows.some((x) => x.platform === o.value))} />
                        </div>
                        <button type="button" className="pacc-link pacc-link--danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          <span className="pmh-rm-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg></span>Прибрати
                        </button>
                      </div>
                      <AdAccountPicker platform={r.platform} value={r.account} onChange={(a) => setRowAccount(r.key, a)} usedKeys={usedKeys} />
                    </div>
                  );
                })}
                {!rows.length && <div className="pacc-hint">Проєкт без рекламного кабінету (SEO, розробка та інше). Кабінет можна підключити пізніше на сторінці проекту.</div>}
                {freePlatform && (
                  <button type="button" className="btn pacc-add" onClick={addRow}><BtnIcon name="plus" />{rows.length ? `Додати ще кабінет (${freePlatform.label})` : 'Підключити кабінет'}</button>
                )}
              </div>
            </section>

            <section id="pmh-pane-main" role="tabpanel" aria-labelledby="pmh-nav-main" hidden={section !== 'main'}>
              <div className="pf-grid">
                <div className="pf full">
                  <label>Назва проєкту</label>
                  <input type="text" value={form.name} onChange={(e) => { setNameTouched(true); setField('name', e.target.value); }} placeholder="напр. Byme — Google Ads" />
                </div>
                <div className="pf full">
                  <label>Клієнт (з контактів CRM)</label>
                  <ClientPicker value={clientId} onChange={applyClient} placeholder="Пошук клієнта або створити нового..." manager={form.manager || undefined} />
                </div>
                <div className="pf">
                  <label>Продакт (менеджер)</label>
                  <input type="text" value={form.manager} onChange={(e) => setField('manager', e.target.value)} placeholder="Ім'я менеджера" />
                </div>
                <div className="pf">
                  <label>Початок роботи над стратегією</label>
                  <DatePicker value={form.start_date} onChange={(v) => setField('start_date', v)} />
                </div>
                <div className="pf">
                  <label>Завершення співпраці</label>
                  <DatePicker value={form.end_date} onChange={(v) => setField('end_date', v)} />
                </div>
              </div>
              <div className="pf full pmh-services">
                <label>Послуги</label>
                <div className="svc-picker">
                  {SERVICES.map((sv) => (
                    <label className="svc-opt" key={sv}>
                      <input type="checkbox" checked={form.services.includes(sv)} onChange={() => toggleService(sv)} />
                      <span><i className="svc-t"><ServiceIcon name={sv} /></i>{sv}<b className="svc-ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></b></span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section id="pmh-pane-more" role="tabpanel" aria-labelledby="pmh-nav-more" hidden={section !== 'more'}>
              <div className="pf-grid">
                <div className="pf">
                  <label>Гео (країна)</label>
                  <input type="text" value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="напр. USA" />
                </div>
                <div className="pf">
                  <label>Сайт</label>
                  <input type="text" value={form.website} onChange={(e) => setField('website', e.target.value)} placeholder="https://..." />
                </div>
              </div>
            </section>

            <section id="pmh-pane-reg" role="tabpanel" aria-labelledby="pmh-nav-reg" hidden={section !== 'reg'}>
              <div className="pf-grid">
                {EXTRA_PROJECT_FIELDS.map((f) => (
                  <div className="pf" key={f.key}>
                    <label>{f.label}</label>
                    {f.type === 'select' ? (
                      <Select value={form[f.key] || ''} onChange={(v) => setField(f.key, v)} ariaLabel={f.label}
                        options={[{ value: '', label: 'Не вказано' }, ...f.options.map((o) => ({ value: o, label: o }))]} />
                    ) : (
                      <input
                        type={f.type === 'url' ? 'text' : f.type} value={form[f.key]} placeholder={f.placeholder}
                        step={f.type === 'number' ? '0.01' : undefined}
                        onChange={(e) => setField(f.key, e.target.value)}
                        onClick={f.type === 'date' ? (e) => e.currentTarget.showPicker?.() : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            {error && <div className="form-err">{error}</div>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn pf-bad" onClick={onClose}><BtnIcon name="x" />Скасувати</button>
            <button type="button" className="btn btn-p pf-ok" onClick={handleSave} disabled={saving}>{!saving && <BtnIcon name="check" />}{saving ? '...' : 'Створити проєкт'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
