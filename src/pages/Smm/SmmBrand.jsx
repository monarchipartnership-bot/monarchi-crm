import { useEffect, useState } from 'react';
import ActionIcon from '../../components/common/ActionIcon';
import { useConfirm } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../contexts/AuthContext';
import { BRAND_FIELDS, deleteCompetitor, runCompetitorAgent, saveBrand } from '../../lib/api/smm';
import { kyivYmd } from '../../lib/smmDates';
import { CompetitorDialog } from './SmmDialogs';

const dmy = (iso) => { const d = kyivYmd(iso); return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : ''; };

function Bullets({ title, items }) {
  if (!items?.length) return null;
  return <div className="smm-rep-sec"><h5>{title}</h5><ul>{items.map((t) => <li key={t}>{t}</li>)}</ul></div>;
}

// What the competitor agent found on a competitor's public pages.
function Report({ report }) {
  const a = report.analysis;
  if (!a) return <p className="smm-error">{report.error || 'Аналіз не вдався.'}</p>;
  return (
    <div className="smm-report">
      {a.positioning && <p><b>Позиціонування:</b> {a.positioning}</p>}
      {a.audience && <p><b>Аудиторія:</b> {a.audience}</p>}
      {a.tone && <p><b>Тон:</b> {a.tone}</p>}
      <div className="smm-rep-grid">
        <Bullets title="Що пропонують" items={a.offers} />
        <Bullets title="Про що пишуть" items={a.content_themes} />
        <Bullets title="Сильні сторони" items={a.strengths} />
        <Bullets title="Слабкі місця" items={a.weaknesses} />
        <Bullets title="Можливості для Monarchi" items={a.opportunities} />
      </div>
      {a.post_ideas?.length > 0 && (
        <div className="smm-rep-sec"><h5>Ідеї постів (агент контенту враховує їх при генерації)</h5>
          <ul>{a.post_ideas.map((p) => <li key={p.topic}><b>{p.topic}</b>{p.angle ? `: ${p.angle}` : ''}</li>)}</ul>
        </div>
      )}
      {a.limits && <p className="smm-hint">Чого агент не побачив: {a.limits}</p>}
      {report.pages?.length > 0 && <p className="smm-hint">Прочитано сторінок: {report.pages.filter((p) => p.ok).length} з {report.pages.length}. Лише публічні сторінки сайту.</p>}
    </div>
  );
}

// How Monarchi speaks (read by every content agent) and who we watch.
export default function SmmBrand({ brand, competitors, reports = {}, notify, reload }) {
  const { email } = useAuth();
  const [form, setForm] = useState(() => Object.fromEntries(BRAND_FIELDS.map((f) => [f.key, brand?.[f.key] || ''])));
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState(null); // null | 'new' | competitor
  const [open, setOpen] = useState(null); // competitor id whose report is open
  const [running, setRunning] = useState(null); // competitor id | 'all'
  const [confirm, confirmDialog] = useConfirm();
  const dirty = BRAND_FIELDS.some((f) => (brand?.[f.key] || '') !== form[f.key]);
  const withSite = competitors.filter((c) => (c.website || '').trim());

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
    if (!(await confirm({ title: 'Видалити конкурента?', body: `«${c.name}» і його звіти зникнуть.`, confirmLabel: 'Видалити', danger: true }))) return;
    try { await deleteCompetitor(c.id); notify('Конкурента видалено.'); reload(); } catch (err) { notify(err.message || 'Не вдалося видалити.', true); }
  }
  async function analyse(id) {
    setRunning(id ?? 'all');
    try {
      const r = await runCompetitorAgent(id);
      const ok = r.results.filter((x) => x.ok).length;
      const failed = r.results.filter((x) => !x.ok);
      notify(failed.length ? `Проаналізовано: ${ok}. Не вдалося: ${failed.map((f) => `${f.name} (${f.error})`).join('; ')}` : `Готово: проаналізовано ${ok}.`, failed.length > 0 && ok === 0);
      if (id && ok) setOpen(id);
      reload();
    } catch (err) { notify(err.message || 'Не вдалося запустити аналіз.', true); } finally { setRunning(null); }
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
              <textarea id={'smm-brand-' + f.key} rows={f.key === 'materials' ? 7 : 3} value={form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} maxLength={f.max || 3000} />
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
          <div className="smm-toolbar-actions">
            {withSite.length > 1 && <button type="button" className="smm-btn" disabled={running != null} onClick={() => analyse(null)}><ActionIcon name="generate" size={18} />{running === 'all' ? 'Аналізуємо…' : 'Проаналізувати всіх'}</button>}
            <button type="button" className="smm-btn" onClick={() => setDialog('new')}><ActionIcon name="create" size={18} />Додати конкурента</button>
          </div>
        </div>
        <p className="smm-muted">Агент читає лише публічні сторінки сайту (головну, блог, послуги, кейси) і поважає robots.txt. Соцмережі він не читає: вони закриті входом. Висновки агент контенту враховує, коли пише пости.</p>
        {running != null && <p className="smm-note" role="status">Агент читає сайти й складає аналіз. Це займає до пари хвилин.</p>}
        {competitors.length === 0 ? <p className="smm-empty smm-empty--big">Конкурентів ще немає. Додайте назву й адресу сайту.</p> : (
          <div className="smm-list">
            {competitors.map((c) => {
              const rep = reports[c.id];
              const hasSite = (c.website || '').trim();
              return (
                <div key={c.id} className="smm-comp">
                  <div className="smm-row smm-row--comp">
                    <span className="smm-row-title"><b>{c.name}</b>{hasSite && <a className="smm-link" href={c.website.startsWith('http') ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer noopener">{c.website}</a>}</span>
                    {rep ? (rep.analysis
                      ? <span className="smm-muted">Аналіз від {dmy(rep.created_at)}</span>
                      : <span className="smm-muted smm-bad">Останній запуск не вдався ({dmy(rep.created_at)})</span>) : <span className="smm-muted">Ще не аналізували</span>}
                    <button type="button" className="smm-btn" disabled={running != null || !hasSite} title={hasSite ? undefined : 'Вкажіть адресу сайту'} onClick={() => analyse(c.id)}>
                      {running === c.id ? 'Аналізуємо…' : rep?.analysis ? 'Оновити аналіз' : 'Проаналізувати'}
                    </button>
                    {rep && <button type="button" className="smm-btn" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>{open === c.id ? 'Сховати' : 'Показати звіт'}</button>}
                    <button type="button" className="smm-icon-btn" onClick={() => setDialog(c)} aria-label={`Редагувати: ${c.name}`}><ActionIcon name="edit" size={18} /></button>
                    <button type="button" className="smm-icon-btn smm-icon-btn--danger" onClick={() => remove(c)} aria-label={`Видалити: ${c.name}`}><ActionIcon name="delete" size={18} /></button>
                  </div>
                  {c.notes && <p className="smm-muted smm-comp-notes">{c.notes}</p>}
                  {open === c.id && rep && <Report report={rep} />}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {dialog && <CompetitorDialog competitor={dialog === 'new' ? null : dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); notify('Конкурента збережено.'); reload(); }} />}
      {confirmDialog}
    </>
  );
}
