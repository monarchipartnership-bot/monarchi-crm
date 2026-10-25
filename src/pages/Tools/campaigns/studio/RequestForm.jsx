import { useEffect, useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import { useAuth } from '../../../../contexts/AuthContext';
import useDialogA11y from '../../../../lib/useDialogA11y';
import { IDEA_SOURCES, MATERIAL_KINDS, MAX_GIVEN_TEXTS, MAX_MATERIALS, REQUEST_LANGUAGES, REQUEST_RATIOS, TEXT_MODES, cleanRequest, parseGivenTexts } from '../../../../lib/agents/creativeTeam';
import { ASSET_KINDS, defaultRatios } from '../../../../lib/agents/projectCreative';
import { FILE_TYPES, MAX_FILE_MB, uploadMaterial } from '../../../../lib/api/creatives';
import { fetchProjectCreative, uploadAsset } from '../../../../lib/api/projectCreative';

const EMPTY = {
  goal: '', product: '', audience: '', message: '', tone: '', must: '', avoid: '', site: '', competitors: '', examples: '', ratios: ['1:1'], count: 3,
  texts: 'yes', given_texts: [], idea_source: 'mix', figma: '', cta: true, cta_text: '', language: 'uk', materials: [],
};
const EMPTY_TEXT = { headline: '', subline: '', badge: '' };
const TEXT_CHOICES = ['yes', 'given', 'no'];

const Field = ({ id, label, hint, children }) => <div className="cmp-field"><label htmlFor={id}>{label}</label>{children}{hint && <span className="cmp-hint">{hint}</span>}</div>;
const Chips = ({ label, value, options, onPick }) => (
  <div className="stu-chips" role="group" aria-label={label}>
    {options.map(([k, v]) => <button key={k} type="button" className={'stu-chip' + (value === k ? ' on' : '')} aria-pressed={value === k} onClick={() => onPick(k)}>{v}</button>)}
  </div>
);

// «Новий запит»: four blocks. 1) the task (what, the offer, the texts: given by the manager word for word, written by the copywriter, or none),
// 2) the ideas (where they come from, competitors' ads, Figma), 3) the materials (the client's library from the project, plus new files),
// 4) the formats of the campaign's platforms and the call-to-action button. «Створити й запустити» starts the chain at once.
export default function RequestForm({ campaign, initial = null, onClose, onSave }) {
  const { email } = useAuth();
  const box = useRef(null);
  const shotInput = useRef(null);
  const assetInput = useRef(null);
  const [f, setF] = useState(() => ({ ...EMPTY, ratios: defaultRatios(campaign.platforms), ...(initial || {}) }));
  const [library, setLibrary] = useState({ assets: [], settings: null });
  const [assetKind, setAssetKind] = useState('product');
  const [paste, setPaste] = useState(null); // null | the text of «вставити всі тексти разом»
  const [more, setMore] = useState(() => !!(initial && (initial.audience || initial.message || initial.must || initial.avoid || initial.tone)));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useDialogA11y(box, onClose);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  // The library and the client's rules come from the project («Креативи»); a new request starts from them (not when it is a copy of an older one).
  useEffect(() => {
    let off = false;
    fetchProjectCreative(campaign.project_id).then((d) => {
      if (off) return;
      setLibrary(d);
      if (!initial) setF((x) => ({ ...x, figma: x.figma || d.settings.figma_url || '', cta: d.settings.cta_mode !== 'none', cta_text: x.cta_text || d.settings.cta_text || '' }));
    }).catch(() => {}); // no access or the tables are not there yet: the form simply starts empty
    return () => { off = true; };
  }, [campaign.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRatio = (key) => set({ ratios: f.ratios.includes(key) ? f.ratios.filter((r) => r !== key) : [...f.ratios, key] });
  const picked = (a) => f.materials.some((m) => m.url === a.url);
  const toggleAsset = (a) => set({ materials: picked(a) ? f.materials.filter((m) => m.url !== a.url) : [...f.materials, { name: a.name, url: a.url, path: a.path, kind: a.kind }].slice(0, MAX_MATERIALS) });
  const shots = f.materials.filter((m) => m.kind === 'competitor');
  const setText = (i, patch) => set({ given_texts: f.given_texts.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  async function addAssets(list) {
    setError(''); setBusy('asset');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadAsset(campaign.project_id, file, assetKind, email));
      setLibrary((l) => ({ ...l, assets: [...l.assets, ...added] }));
      set({ materials: [...f.materials, ...added.map((a) => ({ name: a.name, url: a.url, path: a.path, kind: a.kind }))].slice(0, MAX_MATERIALS) });
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (assetInput.current) assetInput.current.value = ''; }
  }

  async function addShots(list) {
    setError(''); setBusy('shot');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadMaterial(campaign.id, file, 'competitor'));
      set({ materials: [...f.materials, ...added].slice(0, MAX_MATERIALS) });
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (shotInput.current) shotInput.current.value = ''; }
  }

  function applyPaste() {
    const rows = parseGivenTexts(paste);
    if (!rows.length) { setError('Не вдалося розібрати тексти. Кожен текст: заголовок, підзаголовок, плашка по рядках; тексти розділіть номерами «1)» або порожнім рядком.'); return; }
    setError('');
    set({ given_texts: rows.slice(0, MAX_GIVEN_TEXTS) });
    setPaste(null);
  }

  async function submit(start) {
    setError('');
    try { cleanRequest(f); } catch (e) { setError(e.message); return; }
    setBusy(start ? 'start' : 'save');
    try { await onSave(f, start); } catch (e) { setError(e.message || 'Не вдалося зберегти запит.'); setBusy(''); }
  }

  const given = f.texts === 'given';
  const textChoices = f.texts === 'auto' ? ['auto', ...TEXT_CHOICES] : TEXT_CHOICES;

  return (
    <div className="cmp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="cmp-wizard stu-form" role="dialog" aria-modal="true" aria-labelledby="stu-form-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div><span className="cmp-kicker">Креативна студія · {campaign.name}</span><h2 id="stu-form-title">Новий запит на креативи</h2></div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={!!busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="cmp-wiz-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}

          <section className="stu-block" aria-label="Задача">
            <h3><i>1</i>Задача</h3>
            <Field id="stu-goal" label="Що потрібно від креативів *" hint="Задача клієнта своїми словами: для чого, до якої дати, що важливо.">
              <textarea id="stu-goal" className="cmp-input" rows={3} value={f.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={3000} />
            </Field>
            <Field id="stu-product" label="Оффер або пропозиція" hint="Що рекламуємо, яка акція чи умови (лише те, що точно є).">
              <textarea id="stu-product" className="cmp-input" rows={2} value={f.product} onChange={(e) => set({ product: e.target.value })} maxLength={1500} />
            </Field>
            <div className="cmp-field">
              <span className="stu-label">Тексти на креативах</span>
              <Chips label="Тексти на креативах" value={f.texts} options={textChoices.map((k) => [k, TEXT_MODES[k]])} onPick={(k) => set({ texts: k, given_texts: k === 'given' && !f.given_texts.length ? [{ ...EMPTY_TEXT }] : f.given_texts })} />
              <span className="cmp-hint">{given ? 'Кожен текст стане окремим креативом і буде використаний дослівно, без змін.' : f.texts === 'no' ? 'Креативи без тексту на картинці.' : 'Тексти напише Агент копірайтер за технічним завданням.'}</span>
            </div>
            {given && (
              <div className="stu-texts">
                {f.given_texts.map((t, i) => (
                  <div key={i} className="stu-textrow">
                    <b>{i + 1}</b>
                    <input className="cmp-input" value={t.headline} onChange={(e) => setText(i, { headline: e.target.value })} placeholder="Заголовок" aria-label={`Текст ${i + 1}: заголовок`} maxLength={120} />
                    <input className="cmp-input" value={t.subline} onChange={(e) => setText(i, { subline: e.target.value })} placeholder="Підзаголовок" aria-label={`Текст ${i + 1}: підзаголовок`} maxLength={240} />
                    <input className="cmp-input" value={t.badge} onChange={(e) => setText(i, { badge: e.target.value })} placeholder="Плашка (акція)" aria-label={`Текст ${i + 1}: плашка`} maxLength={60} />
                    <button type="button" className="cmp-x" aria-label={`Прибрати текст ${i + 1}`} onClick={() => set({ given_texts: f.given_texts.filter((_, j) => j !== i) })}><ActionIcon name="close" size={16} /></button>
                  </div>
                ))}
                <div className="stu-row-actions">
                  <button type="button" className="cmp-btn" disabled={f.given_texts.length >= MAX_GIVEN_TEXTS} onClick={() => set({ given_texts: [...f.given_texts, { ...EMPTY_TEXT }] })}>Додати текст</button>
                  <button type="button" className="cmp-btn" onClick={() => setPaste(paste === null ? '' : null)}>{paste === null ? 'Вставити всі тексти разом' : 'Сховати вставку'}</button>
                  <span className="cmp-hint">До {MAX_GIVEN_TEXTS} текстів.</span>
                </div>
                {paste !== null && (
                  <div className="stu-paste">
                    <textarea className="cmp-input" rows={7} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Усі тексти разом" placeholder={'1) Заголовок\nПідзаголовок\nПлашка\n\n2) Заголовок\nПідзаголовок\nПлашка'} />
                    <button type="button" className="cmp-btn cmp-btn--primary" disabled={!paste.trim()} onClick={applyPaste}>Розібрати на тексти</button>
                  </div>
                )}
              </div>
            )}
            <button type="button" className="stu-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Сховати додаткове' : 'Додатково: аудиторія, меседж, що обовʼязково й чого не можна'}</button>
            {more && (
              <div className="stu-grid">
                <Field id="stu-audience" label="Аудиторія"><textarea id="stu-audience" className="cmp-input" rows={2} value={f.audience} onChange={(e) => set({ audience: e.target.value })} maxLength={1500} /></Field>
                <Field id="stu-message" label="Головний меседж"><textarea id="stu-message" className="cmp-input" rows={2} value={f.message} onChange={(e) => set({ message: e.target.value })} maxLength={1500} /></Field>
                <Field id="stu-must" label="Обовʼязково" hint="Що має бути в креативах."><textarea id="stu-must" className="cmp-input" rows={2} value={f.must} onChange={(e) => set({ must: e.target.value })} maxLength={1500} /></Field>
                <Field id="stu-avoid" label="Чого не можна" hint="Що не показувати й не обіцяти."><textarea id="stu-avoid" className="cmp-input" rows={2} value={f.avoid} onChange={(e) => set({ avoid: e.target.value })} maxLength={1500} /></Field>
                <Field id="stu-tone" label="Тон"><input id="stu-tone" className="cmp-input" value={f.tone} onChange={(e) => set({ tone: e.target.value })} maxLength={800} /></Field>
              </div>
            )}
          </section>

          <section className="stu-block" aria-label="Ідеї">
            <h3><i>2</i>Ідеї</h3>
            <div className="cmp-field">
              <span className="stu-label">Звідки брати ідеї</span>
              <Chips label="Звідки брати ідеї" value={f.idea_source} options={Object.entries(IDEA_SOURCES)} onPick={(k) => set({ idea_source: k })} />
              <span className="cmp-hint">Від конкурентів: що крутять конкуренти й що можна зробити схоже або краще. Свої: ідеї від ШІ за даними клієнта. Мікс: і те й інше.</span>
            </div>
            <Field id="stu-comp" label="Конкуренти" hint="По одному на рядок: назва й сайт."><textarea id="stu-comp" className="cmp-input" rows={2} value={f.competitors} onChange={(e) => set({ competitors: e.target.value })} maxLength={2000} /></Field>
            <Field id="stu-examples" label="Реклама конкурентів: посилання й опис" hint="Реклама з бібліотек соцмереж автоматично не читається: вставте посилання або опишіть, а скриншоти додайте нижче.">
              <textarea id="stu-examples" className="cmp-input" rows={2} value={f.examples} onChange={(e) => set({ examples: e.target.value })} maxLength={3000} />
            </Field>
            <div className="stu-upload">
              <input ref={shotInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addShots(e.target.files)} />
              <button type="button" className="cmp-btn" disabled={!!busy || f.materials.length >= MAX_MATERIALS} onClick={() => shotInput.current?.click()}>{busy === 'shot' ? 'Завантажуємо…' : 'Додати скриншоти реклами'}</button>
              {shots.length > 0 && <span className="cmp-hint">Скриншотів: {shots.length}</span>}
            </div>
            {shots.length > 0 && (
              <ul className="stu-files">
                {shots.map((m) => (
                  <li key={m.url}>
                    <img src={m.url} alt="" />
                    <span><b>{m.name}</b><small>{MATERIAL_KINDS.competitor}</small></span>
                    <button type="button" className="cmp-x" aria-label={`Прибрати ${m.name}`} onClick={() => set({ materials: f.materials.filter((x) => x.url !== m.url) })}><ActionIcon name="close" size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
            <Field id="stu-figma" label="Макет у Figma" hint="Необовʼязково. Стратег вивчить стиль макета, коли Figma буде підключено."><input id="stu-figma" className="cmp-input" value={f.figma} onChange={(e) => set({ figma: e.target.value })} maxLength={300} placeholder="https://www.figma.com/design/…" /></Field>
          </section>

          <section className="stu-block" aria-label="Матеріали">
            <h3><i>3</i>Матеріали</h3>
            <p className="cmp-muted">Бібліотека клієнта з вкладки «Креативи» проєкту: позначте, що брати в цей запит. Нові файли потрапляють у бібліотеку й одразу позначаються. PNG, JPG або WebP до {MAX_FILE_MB} МБ.</p>
            {library.assets.length === 0 ? <p className="cmp-muted">У бібліотеці клієнта поки порожньо. Додайте логотип і фото продукту: без референсів креативи будуть менш точними.</p> : (
              <ul className="stu-lib">
                {library.assets.map((a) => (
                  <li key={a.id}>
                    <button type="button" className={picked(a) ? 'on' : ''} aria-pressed={picked(a)} onClick={() => toggleAsset(a)} title={a.name}>
                      <img src={a.url} alt="" loading="lazy" />
                      <small>{ASSET_KINDS[a.kind] || a.kind}</small>
                      <span>{picked(a) ? 'Береться' : 'Не береться'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="stu-upload">
              <select className="cmp-input" value={assetKind} onChange={(e) => setAssetKind(e.target.value)} aria-label="Тип матеріалу">{Object.entries(ASSET_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input ref={assetInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addAssets(e.target.files)} />
              <button type="button" className="cmp-btn" disabled={!!busy || f.materials.length >= MAX_MATERIALS} onClick={() => assetInput.current?.click()}>{busy === 'asset' ? 'Завантажуємо…' : 'Додати файли в бібліотеку'}</button>
            </div>
          </section>

          <section className="stu-block" aria-label="Формати й кнопка">
            <h3><i>4</i>Формати й кнопка</h3>
            <div className="cmp-field">
              <span className="stu-label">Формати</span>
              <div className="stu-chips" role="group" aria-label="Формати">
                {REQUEST_RATIOS.map((r) => <button key={r.key} type="button" className={'stu-chip' + (f.ratios.includes(r.key) ? ' on' : '')} aria-pressed={f.ratios.includes(r.key)} onClick={() => toggleRatio(r.key)}>{r.label}</button>)}
              </div>
              <span className="cmp-hint">Підставлено за платформами кампанії: Meta це стрічка 4:5 і сторіз 9:16. Для Google точні розміри будуть уточнені.</span>
            </div>
            <div className="cmp-field">
              <span className="stu-label">Кнопка заклику до дії</span>
              <Chips label="Кнопка заклику до дії" value={f.cta ? 'yes' : 'no'} options={[['yes', 'Потрібна'], ['no', 'Не потрібна (естетика)']]} onPick={(k) => set({ cta: k === 'yes' })} />
              {f.cta && <input className="cmp-input" value={f.cta_text} onChange={(e) => set({ cta_text: e.target.value })} placeholder="Текст кнопки, наприклад: Shop now" aria-label="Текст кнопки" maxLength={40} />}
            </div>
            <Field id="stu-lang" label="Мова текстів">
              <select id="stu-lang" className="cmp-input" value={f.language} onChange={(e) => set({ language: e.target.value })}>{Object.entries(REQUEST_LANGUAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </Field>
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
