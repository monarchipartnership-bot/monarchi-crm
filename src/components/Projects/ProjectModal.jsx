import { useEffect, useMemo, useRef, useState } from 'react';
import ClientPicker from '../Clients/ClientPicker';
import AdAccountPicker from './AdAccountPicker';
import Select from '../common/Select';
import { SERVICES } from '../../lib/projectConstants';
import { EXTRA_PROJECT_FIELDS, extraFieldsForm, extraFieldsPayload } from '../../lib/projectFields';
import { AD_PLATFORMS, platformInfo } from '../../lib/adAccounts';
import { fetchAllProjectAccounts } from '../../lib/api/projectAccounts';
import { fetchClientById } from '../../lib/api/clients';
import { clientFullName } from '../../lib/clientName';
import { COUNTRIES } from '../../lib/countries';
import '../../styles/projectAccounts.css';
import DatePicker from '../common/DatePicker';
import { dropdownOpen } from '../../lib/useDialogA11y';

const EMPTY_FORM = { name: '', manager: '', start_date: '', end_date: '', client: '', country: '', website: '', services: [], ...extraFieldsForm(null) };
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
    if (!name) { setError('Введіть назву проєкту.'); return; }
    if (rows.some((r) => !r.account)) { setError('Оберіть кабінет у кожному рядку або приберіть порожній рядок.'); return; }
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

  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={boxRef} data-dd="plum" className="modal-box pacc-modal proj-modal-folder" role="dialog" aria-modal="true" aria-labelledby="proj-modal-title" tabIndex={-1}>
        <div className="modal-head">
          <h3 id="proj-modal-title">Створити проєкт</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрити">&times;</button>
        </div>
        <div className="modal-body">
          <div className="pf-sec-label">Рекламні кабінети</div>
          <div className="pacc-rows">
            {rows.map((r) => (
              <div className="pacc-row" key={r.key}>
                <div className="pacc-row-head">
                  <div className="pacc-row-platform">
                    <Select value={r.platform} onChange={(v) => setRowPlatform(r.key, v)} options={PLATFORM_OPTIONS.filter((o) => o.value === r.platform || !rows.some((x) => x.platform === o.value))} />
                  </div>
                  <button type="button" className="pacc-link pacc-link--danger" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Прибрати</button>
                </div>
                <AdAccountPicker platform={r.platform} value={r.account} onChange={(a) => setRowAccount(r.key, a)} usedKeys={usedKeys} />
              </div>
            ))}
            {!rows.length && <div className="pacc-hint">Проєкт без рекламного кабінету (SEO, розробка та інше). Кабінет можна підключити пізніше на сторінці проекту.</div>}
            {freePlatform && (
              <button type="button" className="btn pacc-add" onClick={addRow}>+ {rows.length ? `Додати ще кабінет (${freePlatform.label})` : 'Підключити кабінет'}</button>
            )}
          </div>

          <div className="pf-sec-label">Основне</div>
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
          <div className="pf full">
            <label>Послуги</label>
            <div className="svc-picker">
              {SERVICES.map((s) => (
                <label className="svc-opt" key={s}>
                  <input type="checkbox" checked={form.services.includes(s)} onChange={() => toggleService(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pf-sec-label">Додатково</div>
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

          <div className="pf-sec-label">Реєстр проєкту</div>
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

          {error && <div className="form-err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-p" onClick={handleSave} disabled={saving}>{saving ? '...' : 'Створити проєкт'}</button>
          <button type="button" className="btn" onClick={onClose}>Скасувати</button>
        </div>
      </div>
    </div>
  );
}
