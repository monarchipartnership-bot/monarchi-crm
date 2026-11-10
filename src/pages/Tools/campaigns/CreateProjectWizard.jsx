import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ActionIcon from '../../../components/common/ActionIcon';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { fetchClientsForCampaigns } from '../../../lib/api/campaigns';
import { extractProfile, currentProfile, saveExtracted } from '../../../lib/api/projectProfile';
import { fetchProjectAccounts, fetchProjectCreative, saveInput, saveSettings, uploadAsset } from '../../../lib/api/projectCreative';
import { PLATFORMS } from '../../../lib/agents/campaignTeam';
import { FIELD_LABELS } from '../../../lib/agents/agentRequirements';
import { PROFILE_FIELDS, INPUT_FIELDS } from '../../../lib/agents/projectCreative';
import { planWrites } from '../../../lib/agents/profileExtract';
import { DRAFT_KEYS, WIZARD_STEPS, draftFrom, extractedFromDraft, wizardSummary } from '../../../lib/agents/projectWizard';

const LANGS = [{ value: 'uk', label: 'Українська', rec: 'uk-UA' }, { value: 'ru', label: 'Російська', rec: 'ru-RU' }, { value: 'en', label: 'English', rec: 'en-US' }];
const FIELD_META = Object.fromEntries([...PROFILE_FIELDS, ...INPUT_FIELDS].map((f) => [f.key, f]));
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const platformLabel = (p) => PLATFORMS[p]?.label || p;

// «Створити проєкт» (spec 2026-11-02, §4): 0 the client from the CRM with a cabinet · 1 what the agents must know about them (quick fill by words or voice → «Зрозумів так», or by hand)
// · 2 what cannot be said aloud (links, files) and what is still missing · 3 «Створити операцію» or «Зробити пізніше». Nothing is written before the person agrees on step 1.
export default function CreateProjectWizard({ onClose, onDone, notify }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState(null);
  const [query, setQuery] = useState('');
  const [project, setProject] = useState(null);
  const [mode, setMode] = useState(null); // 'quick' | 'manual'
  const [text, setText] = useState('');
  const [lang, setLang] = useState('uk');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const [existing, setExisting] = useState(null);
  const [reading, setReading] = useState(null); // the model's reading: links, needsFiles, unplaced
  const [draft, setDraft] = useState(null);
  const [replace, setReplace] = useState({}); // conflict key -> true
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [state, setState] = useState(null); // step 2: { settings, assets, accounts }
  const [saved, setSaved] = useState([]);
  useDialogA11y(box, () => { if (!busy) onClose(); });

  useEffect(() => { fetchClientsForCampaigns().then(setClients).catch((e) => { setClients([]); setError(e.message || 'Не вдалося завантажити клієнтів.'); }); }, []);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* already stopped */ } }, []);

  const list = useMemo(() => (clients || []).filter((c) => c.accounts.length && `${c.name} ${c.client || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [clients, query]);
  const conflicts = useMemo(() => (draft && existing && mode === 'quick' ? planWrites(extractedFromDraft(draft), existing).conflicts : []), [draft, existing, mode]);
  const summary = useMemo(() => (state ? wizardSummary({ extracted: { fields: {}, links: reading?.links || [], needsFiles: reading?.needsFiles || [], unplaced: reading?.unplaced || [] }, settings: state.settings, assets: state.assets, accounts: state.accounts }) : null), [state, reading]);

  async function run(key, fn) {
    setBusy(key); setError('');
    try { return await fn(); } catch (e) { setError(e.message || 'Не вдалося виконати.'); return undefined; } finally { setBusy(''); }
  }
  async function reloadState(p = project) {
    const [c, accounts, cur] = await Promise.all([fetchProjectCreative(p.id), fetchProjectAccounts(p.id), currentProfile(p.id)]);
    setState({ settings: c.settings, assets: c.assets, accounts });
    setExisting(cur);
  }

  const toStep1 = () => run('load', async () => { setExisting(await currentProfile(project.id)); setStep(1); });
  const pick = (m) => { setMode(m); if (m === 'manual') setDraft(draftFrom(existing)); };

  function toggleMic() {
    if (!SR) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* ignore */ } return; }
    const r = new SR();
    r.lang = LANGS.find((l) => l.value === lang).rec; r.continuous = true; r.interimResults = true;
    const base = text.trim();
    r.onresult = (e) => {
      let fin = ''; let interim = '';
      for (let i = 0; i < e.results.length; i += 1) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += `${t} `; else interim += t; }
      setText(`${base} ${fin}${interim}`.trim());
    };
    r.onerror = (e) => { setError(e.error === 'not-allowed' ? 'Браузер не дозволив мікрофон. Дозвольте доступ у налаштуваннях сайту.' : 'Не вдалося розпізнати мовлення. Напишіть текстом.'); };
    r.onend = () => { setListening(false); recRef.current = null; };
    recRef.current = r; setListening(true);
    try { r.start(); } catch { setListening(false); }
  }

  const parse = () => run('parse', async () => {
    try { recRef.current?.stop(); } catch { /* ignore */ }
    const x = await extractProfile(text, lang);
    setReading({ links: x.links || [], needsFiles: x.needsFiles || [], unplaced: x.unplaced || [] });
    setDraft(draftFrom(x)); setReplace({});
  });

  const setField = (k, v) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));

  const saveAndNext = () => run('save', async () => {
    const extracted = extractedFromDraft(draft, reading || {});
    const accept = mode === 'manual' ? planWrites(extracted, existing).conflicts.map((c) => c.key) : Object.keys(replace).filter((k) => replace[k]);
    const r = await saveExtracted(project.id, extracted, { email, accept });
    if (mode === 'manual' && extracted.cta && (extracted.cta.mode !== (existing.cta_mode === 'none' ? 'none' : 'always') || extracted.cta.text !== (existing.cta_text || ''))) {
      const cur = (await fetchProjectCreative(project.id)).settings;
      await saveSettings(project.id, { ...cur, cta_mode: extracted.cta.mode, cta_text: extracted.cta.text }, email);
    }
    setSaved(r.saved);
    await reloadState();
    setStep(2);
  });

  const appendTo = (key, add) => run('append', async () => {
    const cur = (await fetchProjectCreative(project.id)).settings.inputs?.[key]?.body || '';
    await saveInput(project.id, key, cur ? `${cur}\n${add}` : add, email);
    setReading((r) => ({ ...r, links: (r.links || []).filter((l) => l.url !== add), unplaced: (r.unplaced || []).filter((u) => u !== add) }));
    await reloadState();
  });
  const upload = (file, kind) => file && run('upload', async () => { await uploadAsset(project.id, file, kind, email); await reloadState(); });

  const finish = (createOperation) => { notify?.(createOperation ? 'Дані клієнта збережено. Створюємо операцію.' : 'Дані клієнта збережено. Операцію можна створити пізніше.'); onDone({ projectId: project.id, createOperation }); };
  const next0 = project && (
    <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={toStep1}>{busy === 'load' ? '…' : 'Далі'}</button>
  );

  return createPortal(
    <div className="cmp-overlay ai-immersive" data-ai-safe>
      <div ref={box} className="cmp-wizard cpw" role="dialog" aria-modal="true" aria-labelledby="cpw-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div><span className="cmp-kicker">Новий проєкт</span><h2 id="cpw-title">Що агенти мають знати про клієнта</h2></div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={!!busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <ol className="cpw-line" aria-label="Кроки">
          {WIZARD_STEPS.map((st, i) => (
            <Fragment key={st.key}>
              {i > 0 && <li className={'cpw-ln' + (step >= i ? ' is-done' : '')} aria-hidden="true" />}
              <li className={'cpw-st' + (step === i ? ' is-current' : step > i ? ' is-done' : '')} aria-current={step === i ? 'step' : undefined}><i>{step > i ? <ActionIcon name="select" size={14} /> : i + 1}</i>{st.label}</li>
            </Fragment>
          ))}
        </ol>

        <div className="cmp-wiz-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}

          {step === 0 && (
            <section className="cmp-clientpick cpw-narrow">
              <h3>1. Оберіть клієнта з кабінетом у CRM</h3>
              <p className="cmp-muted">Агенти читають цифри рекламного кабінету, тому проєкт має його мати.</p>
              <input className="cmp-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук клієнта або проєкту" aria-label="Пошук клієнта" />
              {clients === null && <p className="cmp-muted">Завантаження…</p>}
              {clients && !list.length && <p className="cmp-muted">Немає проєктів із привʼязаним рекламним кабінетом{query ? ' за цим пошуком' : ''}. Привʼяжіть кабінет у картці проєкту.</p>}
              <ul className="cmp-clients">
                {list.map((c) => (
                  <li key={c.id}>
                    <button type="button" className={'cmp-client' + (project?.id === c.id ? ' is-active' : '')} onClick={() => setProject(c)} aria-pressed={project?.id === c.id}>
                      <span className="cpw-av" aria-hidden="true">{(c.name || '?').charAt(0).toUpperCase()}</span>
                      <span className="cpw-cl-tx"><span className="cmp-client-name">{c.name}</span><span className="cmp-client-sub">{c.client || '—'}</span></span>
                      <span className="cmp-client-badges">{c.accounts.map((a) => <em key={a.platform + a.account_id} style={{ '--c': PLATFORMS[a.platform]?.color || '#EB9CEF' }}>{platformLabel(a.platform)}</em>)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step === 1 && existing && (
            <section className="cpw-wide">
              <h3>2. Розкажіть про клієнта «{project.name}»</h3>
              {!mode && (
                <div className="cpw-choice">
                  <button type="button" className="cpw-card" onClick={() => pick('quick')}><span className="cpw-bm"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg></span><b>Швидке заповнення</b><span>Розкажіть голосом або напишіть своїми словами: модель розкладе все по полях, а ви перевірите.</span></button>
                  <button type="button" className="cpw-card" onClick={() => pick('manual')}><span className="cpw-bm"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></svg></span><b>Ручне заповнення</b><span>Усі поля форми: заповнюєте самі, нічого не вгадується.</span></button>
                </div>
              )}

              {mode === 'quick' && !draft && (
                <div className="cpw-quick">
                  <p className="cmp-muted">Чим займається клієнт, що продає, кому, чим відрізняється, конкуренти, тон, обмеження («чого не можна»), цілі, бюджет, ринки, сайт. Можна довільно і в будь-якому порядку.</p>
                  <textarea className="cmp-input" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Наприклад: Mellow Diamond продає прикраси з лабораторних діамантів у США, аудиторія жінки 25–45, конкуренти Brilliant Earth, тон теплий, на «ви»…" aria-label="Розповідь про клієнта" />
                  <div className="cpw-row">
                    <select className="cmp-input cpw-lang" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Мова розповіді">{LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
                    {SR ? <button type="button" className={'cmp-btn' + (listening ? ' cmp-btn--danger' : '')} onClick={toggleMic} aria-pressed={listening}>{listening ? '⏹ Зупинити запис' : '🎤 Говорити'}</button> : <span className="cmp-muted">Голос працює в Chrome; тут напишіть текстом.</span>}
                    <button type="button" className="cmp-btn cmp-btn--primary" disabled={text.trim().length < 8 || !!busy} onClick={parse}>{busy === 'parse' ? 'Розбираю…' : 'Розібрати'}</button>
                  </div>
                </div>
              )}

              {draft && (
                <div className="cpw-review">
                  <p className="cmp-note">{mode === 'quick' ? '«Зрозумів так»: перевірте й виправте. Нічого не збережено, доки ви не натиснете «Зберегти й далі». Те, що вже є в картці клієнта, не перезаписується без вашої згоди.' : 'Заповніть те, що знаєте: порожнє пропускається. Змінене значення замінить старе.'}</p>
                  {DRAFT_KEYS.map((k) => {
                    const c = conflicts.find((x) => x.key === k);
                    const filled = !!draft.fields[k].trim();
                    if (mode === 'quick' && !filled && !existing.fields[k]) return null;
                    return (
                      <div className={'cmp-field cpw-field' + (filled ? ' has-value' : '')} key={k}>
                        <label htmlFor={`cpw-${k}`}>{FIELD_META[k]?.label || FIELD_LABELS[k] || k}</label>
                        <textarea id={`cpw-${k}`} className="cmp-input" rows={filled && draft.fields[k].length > 160 ? 5 : 3} value={draft.fields[k]} onChange={(e) => setField(k, e.target.value)} placeholder={FIELD_META[k]?.hint} />
                        {c && <label className="cpw-conf"><input type="checkbox" checked={!!replace[k]} onChange={(e) => setReplace((r) => ({ ...r, [k]: e.target.checked }))} /> Замінити те, що вже в картці: «{c.old.length > 140 ? `${c.old.slice(0, 140)}…` : c.old}»</label>}
                      </div>
                    );
                  })}
                  <div className="cmp-field cpw-field"><label htmlFor="cpw-restr">Обмеження клієнта (чого не можна)</label>
                    <textarea id="cpw-restr" className="cmp-input" rows={3} value={draft.restrictions} onChange={(e) => setDraft((d) => ({ ...d, restrictions: e.target.value }))} placeholder="Слова, обіцянки, теми, яких уникаємо" />
                    {conflicts.find((x) => x.key === 'restrictions') && <label className="cpw-conf"><input type="checkbox" checked={!!replace.restrictions} onChange={(e) => setReplace((r) => ({ ...r, restrictions: e.target.checked }))} /> Замінити обмеження, що вже в картці</label>}
                  </div>
                  <div className="cpw-row3">
                    <div className="cmp-field"><label htmlFor="cpw-figma">Макет Figma</label><input id="cpw-figma" className="cmp-input" value={draft.figma} onChange={(e) => setDraft((d) => ({ ...d, figma: e.target.value }))} placeholder="https://www.figma.com/…" /></div>
                    <div className="cmp-field"><label htmlFor="cpw-cta">Кнопка заклику до дії</label>
                      <div className="cpw-cta">
                        <select className="cmp-input" value={draft.ctaMode} onChange={(e) => setDraft((d) => ({ ...d, ctaMode: e.target.value }))} aria-label="Режим кнопки"><option value="always">Завжди</option><option value="none">Не потрібна</option></select>
                        {draft.ctaMode === 'always' && <input id="cpw-cta" className="cmp-input" value={draft.ctaText} onChange={(e) => setDraft((d) => ({ ...d, ctaText: e.target.value }))} placeholder="Shop now" />}
                      </div>
                    </div>
                  </div>
                  {mode === 'quick' && <button type="button" className="cmp-btn" onClick={() => { setDraft(null); setReading(null); }}>Розповісти ще раз</button>}
                </div>
              )}
            </section>
          )}

          {step === 2 && summary && state && (
            <section className="cpw-wide">
              <h3>3. Посилання, файли й чого ще не вистачає</h3>
              {saved.length > 0 && <p className="cmp-note">Збережено в картці клієнта: {saved.map((k) => FIELD_LABELS[k] || k).join(', ')}.</p>}

              {reading?.links?.length > 0 && (
                <div className="cpw-block"><h4>Посилання, які ви згадали</h4>
                  {reading.links.map((l) => <div className="cpw-item" key={l.url}><span><a href={l.url} target="_blank" rel="noreferrer noopener">{l.url}</a>{l.about ? ` — ${l.about}` : ''}</span><button type="button" className="cmp-btn" disabled={!!busy} onClick={() => appendTo('examples', l.url)}>У «Приклади креативів»</button></div>)}
                </div>
              )}
              {reading?.unplaced?.length > 0 && (
                <div className="cpw-block"><h4>Не знайшов для цього місця в картці</h4>
                  {reading.unplaced.map((u) => <div className="cpw-item" key={u}><span>{u}</span><button type="button" className="cmp-btn" disabled={!!busy} onClick={() => appendTo('about', u)}>До опису бізнесу</button></div>)}
                </div>
              )}
              <div className="cpw-block"><h4>Файли, які голосом не передати</h4>
                {reading?.needsFiles?.length > 0 && <p className="cmp-muted">Ви згадали: {reading.needsFiles.join('; ')}.</p>}
                <div className="cpw-uploads">
                  {[['logo', 'Логотип'], ['product', 'Фото продукту'], ['style', 'Приклад стилю']].map(([kind, label]) => (
                    <label className="cmp-btn cpw-file" key={kind}>{busy === 'upload' ? '…' : `Додати: ${label}`}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={!!busy} onChange={(e) => { upload(e.target.files?.[0], kind); e.target.value = ''; }} /></label>
                  ))}
                </div>
                <p className="cmp-muted">{state.assets.length ? `У бібліотеці клієнта: ${state.assets.length} ${state.assets.length === 1 ? 'файл' : 'файлів'}.` : 'Бібліотека клієнта порожня: логотип і фото продукту покращують кожен креатив.'}</p>
              </div>

              <div className="cpw-block"><h4>Чого агентам ще не вистачає</h4>
                {!summary.blockers.length && <p className="cmp-note">Обовʼязкове заповнено: можна створювати операцію будь-якого типу.</p>}
                {summary.blockers.length > 0 && <ul className="cpw-miss">{summary.blockers.map((b) => <li key={b.key} className="is-block"><b>{b.label || FIELD_LABELS[b.key] || b.key}</b><span>потрібно: {b.agents.join(', ')}</span></li>)}</ul>}
                {summary.recommended.length > 0 && <details className="cpw-more"><summary>Бажано ({summary.recommended.length})</summary><ul className="cpw-miss">{summary.recommended.map((b) => <li key={b.key}><b>{b.label || FIELD_LABELS[b.key] || b.key}</b><span>покращить: {b.agents.join(', ')}</span></li>)}</ul></details>}
                {summary.blockers.length > 0 && <p className="cmp-muted">Заповніть це зараз (крок назад) або під час створення операції: без обовʼязкового окремі агенти не запустяться.</p>}
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="cpw-narrow cpw-done">
              <h3>Дані клієнта «{project.name}» збережено</h3>
              <p className="cmp-muted">Тепер можна одразу створити операцію (агенти візьмуть ці дані з картки) або зробити це пізніше: проєкт уже збережено й закривається.</p>
            </section>
          )}
        </div>

        <footer className="cmp-wiz-foot">
          {step === 0 && <><button type="button" className="cmp-btn" onClick={onClose}>Скасувати</button>{next0}</>}
          {step === 1 && (
            <>
              <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => { if (draft || mode) { setMode(null); setDraft(null); setReading(null); } else setStep(0); }}>Назад</button>
              {draft && <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={saveAndNext}>{busy === 'save' ? 'Зберігаю…' : 'Зберегти й далі'}</button>}
              {!draft && mode === 'manual' && null}
            </>
          )}
          {step === 2 && <><button type="button" className="cmp-btn" disabled={!!busy} onClick={() => setStep(1)}>Назад до даних</button><button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={() => setStep(3)}>Далі</button></>}
          {step === 3 && <><button type="button" className="cmp-btn" onClick={() => finish(false)}>Зробити пізніше</button><button type="button" className="cmp-btn cmp-btn--primary" onClick={() => finish(true)}>Створити операцію</button></>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
