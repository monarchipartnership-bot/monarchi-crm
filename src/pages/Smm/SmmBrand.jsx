import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { BRAND_FIELDS, deleteCompetitor, saveBrand } from '../../lib/api/smm';
import { CompetitorDialog } from './SmmDialogs';

// How Monarchi speaks (read by every content agent) and who we watch.
export default function SmmBrand({ brand, competitors, notify, reload }) {
  const { email } = useAuth();
  const [form, setForm] = useState(() => Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, brand?.[f.key] || ''])));
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null); // null | 'new' | competitor
  const [confirm, confirmDialog] = useConfirm();
  const dirty = BRAND_FIELDS.some((f) => (brand?.[f.key] || '') !== form[f.key]);

  useEffect(() => { setForm(Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, brand?.[f.key] || '']))); }, [brand]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try { await saveBrand(form, email); notify('Бренд-профіль збережено.'); reload(); } catch (err) { notify(err.message || 'Не вдалося зберегти.', true); } finally { setSaving(false); }
  }
  async function remove(c) {
    if (!(await confirm({ title: 'Видалити конкурента?', body: `«${c.name}» зникне зі списку.`, confirmLabel: 'Видалити', danger: true }))) return;
    try { await deleteCompetitor(c.id); notify('Конкурента видалено.'); reload(); } catch (err) { notify(err.message || 'Не вдалося видалити.', true); }
  }

  return (
    <>
      <section className="smm-block">
        <h3>Бренд-профіль</h3>
        <p className="smm-muted">Усе, що тут написано, агенти читають перед кожним постом. Чого немає в полі «Факти й матеріали», того агент не вигадає: без фактів він пише загальні експертні пости.</p>
        <form className="smm-form smm-form--brand" onSubmit={save}>
          {BRAND_FIELDS.map((f) => (
            <div key={f.key} className="smm-field smm-field--wide">
              <label htmlFor={'smm-brand-' + f.key}>{f.label}</label>
              <textarea id={'smm-brand-' + f.key} rows={f.key === 'materials' ? 7 : 3} value={form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} maxLength={3000} />
              <span className="smm-hint">{f.hint}</span>
            </div>
          ))}
          <div className="smm-form-foot smm-field--wide">
            <button type="submit" className="smm-btn smm-btn--primary" disabled={saving || !dirty}><ActionIcon name="save" size={18} />{saving ? 'Зберігаємо…' : 'Зберегти профіль'}</button>
            {dirty && <span className="smm-muted">Є незбережені зміни</span>}
          </div>
        </form>
      </section>

      <section className="smm-block">
        <div className="smm-block-head">
          <h3>Конкуренти <span className="smm-count-pill">{competitors.length}</span></h3>
          <button type="button" className="smm-btn" onClick={() => setDialog('new')}><ActionIcon name="create" size={18} />Додати конкурента</button>
        </div>
        <p className="smm-muted">Поки агент контенту бере звідси лише назви й нотатки, щоб відрізнятися від них. Агент-моніторинг, який читатиме їхні сайти й сторінки, буде наступним кроком.</p>
        {competitors.length === 0 ? <p className="smm-empty smm-empty--big">Конкурентів ще немає.</p> : (
          <div className="smm-list">
            {competitors.map((c) => (
              <div key={c.id} className="smm-row smm-row--comp">
                <span className="smm-row-title"><b>{c.name}</b>{c.website && <a className="smm-link" href={c.website.startsWith('http') ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer noopener">{c.website}</a>}</span>
                {c.notes && <span className="smm-muted smm-row-note">{c.notes}</span>}
                <button type="button" className="smm-icon-btn" onClick={() => setDialog(c)} aria-label={`Редагувати: ${c.name}`}><ActionIcon name="edit" size={18} /></button>
                <button type="button" className="smm-icon-btn smm-icon-btn--danger" onClick={() => remove(c)} aria-label={`Видалити: ${c.name}`}><ActionIcon name="delete" size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {dialog && <CompetitorDialog competitor={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); notify('Конкурента збережено.'); reload(); }} />}
      {confirmDialog}
    </>
  );
}
