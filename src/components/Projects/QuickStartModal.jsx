import { useRef, useState } from 'react';
import AdAccountPicker from './AdAccountPicker';
import useDialogA11y from '../../lib/useDialogA11y';
import { QUICK_STEPS, nameFromSite, normalizeSite } from '../../lib/workflow/quickStart';

// «Швидкий старт»: one link, an optional name, country and Meta cabinet. The rest is drafted from the website and checked by the manager.
export default function QuickStartModal({ onClose, onStart, busy }) {
  const box = useRef(null);
  const [site, setSite] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [account, setAccount] = useState(null);
  const [err, setErr] = useState('');
  useDialogA11y(box, onClose, { initialFocus: '#qs-site' });
  const clean = normalizeSite(site);

  function submit(e) {
    e.preventDefault();
    if (!clean) { setErr('Вкажіть адресу сайту повністю, наприклад https://example.com'); return; }
    setErr('');
    onStart({ website: clean, name, country, account });
  }
  return (
    <div className="modal-overlay show" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form ref={box} data-dd="night" className="modal-box proj-modal-folder qs-dialog" role="dialog" aria-modal="true" aria-label="Швидкий старт" tabIndex={-1} style={{ maxWidth: 560 }} onSubmit={submit}>
        <h2 style={{ margin: '0 0 4px' }}>Швидкий старт</h2>
        <p style={{ margin: '0 0 14px', opacity: 0.75 }}>Достатньо посилання на сайт клієнта: бриф складеться з нього, а ви його перевірите.</p>
        <div className="pf-grid">
          <div className="pf full">
            <label htmlFor="qs-site">Сайт клієнта</label>
            <input id="qs-site" type="text" inputMode="url" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://example.com" autoComplete="off" />
          </div>
          <div className="pf">
            <label htmlFor="qs-name">Назва проєкту (необов’язково)</label>
            <input id="qs-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={clean ? nameFromSite(clean) : 'з адреси сайту'} />
          </div>
          <div className="pf">
            <label htmlFor="qs-country">Країна показу (необов’язково)</label>
            <input id="qs-country" type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Україна" />
          </div>
          <div className="pf full">
            <label>Рекламний кабінет Meta (можна підключити пізніше)</label>
            <AdAccountPicker platform="meta" value={account} onChange={setAccount} usedKeys={new Set()} />
          </div>
        </div>
        <div style={{ margin: '14px 0 0', fontSize: 13 }}>
          <b>Що станеться далі</b>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>{QUICK_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
        {err && <div role="alert" className="form-err" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className="btn btn-p" disabled={busy || !site.trim()}>{busy ? 'Створюю…' : 'Створити і почати'}</button>
        </div>
      </form>
    </div>
  );
}
