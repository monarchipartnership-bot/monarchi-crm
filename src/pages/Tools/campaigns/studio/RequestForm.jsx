import { useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import useDialogA11y from '../../../../lib/useDialogA11y';
import { MATERIAL_KINDS, MAX_CONCEPTS, REQUEST_LANGUAGES, REQUEST_RATIOS, TEXT_MODES, cleanRequest } from '../../../../lib/agents/creativeTeam';
import { FILE_TYPES, MAX_FILE_MB, uploadMaterial } from '../../../../lib/api/creatives';

const EMPTY = { goal: '', product: '', audience: '', message: '', tone: '', must: '', avoid: '', site: '', competitors: '', examples: '', ratios: ['1:1'], count: 3, texts: 'auto', language: 'uk', materials: [] };

const Field = ({ id, label, hint, children }) => <div className="cmp-field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="cmp-hint">{hint}</span>}</div>;

// «Новий запит»: what the client asks for and the materials the creatives are built on. «Створити й запустити» starts the chain at once.
export default function RequestForm({ campaign, initial = null, onClose, onSave }) {
  const box = useRef(null);
  const fileInput = useRef(null);
  const [f, setF] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [kind, setKind] = useState('product');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useDialogA11y(box, onClose);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toggleRatio = (key) => set({ ratios: f.ratios.includes(key) ? f.ratios.filter((r) => r !== key) : [...f.ratios, key] });

  async function addFiles(list) {
    setError('');
    setBusy('upload');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadMaterial(campaign.id, file, kind));
      set({ materials: [...f.materials, ...added].slice(0, 12) });
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function submit(start) {
    setError('');
    try { cleanRequest(f); } catch (e) { setError(e.message); return; }
    setBusy(start ? 'start' : 'save');
    try { await onSave(f, start); } catch (e) { setError(e.message || 'Не вдалося зберегти запит.'); setBusy(''); }
  }

  return (
    <div className="cmp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="cmp-wizard stu-form" role="dialog" aria-modal="true" aria-labelledby="stu-form-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div><span className="cmp-kicker">Креативна студія · {campaign.name}</span><h2 id="stu-form-title">Новий запит на креативи</h2></div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={!!busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="cmp-wiz-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}
          <div className="stu-grid">
            <Field id="stu-goal" label="Що потрібно від креативів *" hint="Задача клієнта своїми словами: для чого, до якої дати, що важливо.">
              <textarea id="stu-goal" className="cmp-input" rows={4} value={f.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={3000} />
            </Field>
            <Field id="stu-product" label="Продукт або пропозиція" hint="Що рекламуємо, яка акція чи умови (лише те, що точно є).">
              <textarea id="stu-product" className="cmp-input" rows={4} value={f.product} onChange={(e) => set({ product: e.target.value })} maxLength={1500} />
            </Field>
            <Field id="stu-audience" label="Аудиторія"><textarea id="stu-audience" className="cmp-input" rows={3} value={f.audience} onChange={(e) => set({ audience: e.target.value })} maxLength={1500} /></Field>
            <Field id="stu-message" label="Головний меседж"><textarea id="stu-message" className="cmp-input" rows={3} value={f.message} onChange={(e) => set({ message: e.target.value })} maxLength={1500} /></Field>
            <Field id="stu-must" label="Обовʼязково" hint="Що має бути в креативах."><textarea id="stu-must" className="cmp-input" rows={3} value={f.must} onChange={(e) => set({ must: e.target.value })} maxLength={1500} /></Field>
            <Field id="stu-avoid" label="Чого не можна" hint="Що не показувати й не обіцяти."><textarea id="stu-avoid" className="cmp-input" rows={3} value={f.avoid} onChange={(e) => set({ avoid: e.target.value })} maxLength={1500} /></Field>
            <Field id="stu-tone" label="Тон"><input id="stu-tone" className="cmp-input" value={f.tone} onChange={(e) => set({ tone: e.target.value })} maxLength={800} /></Field>
            <Field id="stu-site" label="Сайт клієнта" hint="Аналітик прочитає його сторінки."><input id="stu-site" className="cmp-input" value={f.site} onChange={(e) => set({ site: e.target.value })} maxLength={300} placeholder="https://" /></Field>
            <Field id="stu-comp" label="Конкуренти" hint="По одному на рядок: назва й сайт."><textarea id="stu-comp" className="cmp-input" rows={3} value={f.competitors} onChange={(e) => set({ competitors: e.target.value })} maxLength={2000} /></Field>
            <Field id="stu-examples" label="Приклади креативів конкурентів" hint="Опишіть або вставте текст, посилання. Реклама з бібліотек соцмереж автоматично не читається."><textarea id="stu-examples" className="cmp-input" rows={3} value={f.examples} onChange={(e) => set({ examples: e.target.value })} maxLength={3000} /></Field>
          </div>

          <div className="stu-grid stu-grid--opts">
            <fieldset className="stu-fieldset">
              <legend>Формати</legend>
              <div className="stu-checks">{REQUEST_RATIOS.map((r) => <label key={r.key}><input type="checkbox" checked={f.ratios.includes(r.key)} onChange={() => toggleRatio(r.key)} />{r.label}</label>)}</div>
            </fieldset>
            <Field id="stu-count" label={`Кількість напрямів (1–${MAX_CONCEPTS})`}><input id="stu-count" type="number" min={1} max={MAX_CONCEPTS} className="cmp-input" value={f.count} onChange={(e) => set({ count: e.target.value })} /></Field>
            <Field id="stu-texts" label="Тексти до креативів">
              <select id="stu-texts" className="cmp-input" value={f.texts} onChange={(e) => set({ texts: e.target.value })}>{Object.entries(TEXT_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
            <Field id="stu-lang" label="Мова текстів">
              <select id="stu-lang" className="cmp-input" value={f.language} onChange={(e) => set({ language: e.target.value })}>{Object.entries(REQUEST_LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
          </div>

          <section className="stu-materials" aria-label="Матеріали клієнта">
            <h3>Матеріали клієнта</h3>
            <p className="cmp-muted">Логотип, фото продукту, приклади стилю. Креативи будуються на них як на референсах. PNG, JPG або WebP до {MAX_FILE_MB} МБ, до 12 файлів.</p>
            <div className="stu-upload">
              <select className="cmp-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Тип матеріалу">{Object.entries(MATERIAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input ref={fileInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addFiles(e.target.files)} />
              <button type="button" className="cmp-btn" disabled={!!busy || f.materials.length >= 12} onClick={() => fileInput.current?.click()}>{busy === 'upload' ? 'Завантажуємо…' : 'Додати файли'}</button>
            </div>
            {f.materials.length > 0 && (
              <ul className="stu-files">
                {f.materials.map((m, i) => (
                  <li key={m.url}>
                    <img src={m.url} alt="" />
                    <span><b>{m.name}</b><small>{MATERIAL_KINDS[m.kind]}</small></span>
                    <button type="button" className="cmp-x" aria-label={`Прибрати ${m.name}`} onClick={() => set({ materials: f.materials.filter((_, j) => j !== i) })}><ActionIcon name="close" size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <footer className="cmp-wiz-foot">
          <span className="cmp-foot-note">Нічого не публікується й не завантажується в рекламні кабінети: результат іде на ваше затвердження.</span>
          <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => submit(false)}>{busy === 'save' ? 'Зберігаємо…' : 'Зберегти чернетку'}</button>
          <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={() => submit(true)}>{busy === 'start' ? 'Запускаємо…' : 'Створити й запустити'}</button>
        </footer>
      </div>
    </div>
  );
}
