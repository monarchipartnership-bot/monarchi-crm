import { useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import { useAuth } from '../../../../contexts/AuthContext';
import useDialogA11y from '../../../../lib/useDialogA11y';
import { IDEA_SOURCES, MATERIAL_KINDS, MAX_CONCEPTS, MAX_GIVEN_TEXTS, MAX_MATERIALS, REQUEST_LANGUAGES, REQUEST_RATIOS, cleanRequest, parseGivenTexts } from '../../../../lib/agents/creativeTeam';
import { ASSET_KINDS, defaultRatios, inputState } from '../../../../lib/agents/projectCreative';
import { FILE_TYPES, MAX_FILE_MB, uploadMaterial } from '../../../../lib/api/creatives';
import { fetchProjectCreative, saveInput, uploadAsset } from '../../../../lib/api/projectCreative';

const EMPTY = {
  goal: '', product: '', audience: '', message: '', tone: '', must: '', avoid: '', site: '', competitors: '', examples: '', ratios: ['1:1'], count: 3,
  texts: 'yes', given_texts: [], idea_source: 'mix', figma: '', cta: true, cta_text: '', language: 'uk', materials: [],
};
const EMPTY_TEXT = { headline: '', subline: '', badge: '' };
const PASTE_HINT = 'Вставте всі тексти разом, по три рядки на кожен: заголовок, підзаголовок, плашка.\nТексти розділіть номерами «1)» або порожнім рядком.';

const Chips = ({ label, value, options, onPick }) => (
  <div className="stu-chips" role="group" aria-label={label}>
    {options.map(([k, v]) => <button key={k} type="button" className={'stu-chip' + (value === k ? ' on' : '')} aria-pressed={value === k} onClick={() => onPick(k)}>{v}</button>)}
  </div>
);
const body = (item) => String(item?.body || '').trim();
const clipText = (t, n = 90) => (t.length > n ? `${t.slice(0, n).trim()}…` : t);
const ageOf = (item) => {
  const s = inputState(item);
  if (s.days == null) return null;
  return { old: s.state === 'old', text: s.state === 'old' ? `застаріло ${s.days} дн.` : s.days === 0 ? 'сьогодні' : `${s.days} дн. тому` };
};

// «Новий запит» (the quick request, design decision 2026-11-01, variant A): ONE sentence about what is needed, one row of parameters (how many
// directions, the formats, ready texts), one row «З картки проєкту» (the offer, audience, restrictions, button, Figma and the materials of the client are
// taken from the «Креативи» tab of the project, they are not fields here) and a closed «Додатково». Nothing opens over the window: pasting the texts,
// adding a file and changing a value of the card are all inside it. An empty card asks only what we sell and for a logo or a photo, and keeps the answers.
export default function RequestForm({ campaign, initial = null, onClose, onSave }) {
  const { email } = useAuth();
  const box = useRef(null);
  const shotInput = useRef(null);
  const assetInput = useRef(null);
  const [f, setF] = useState(() => ({ ...EMPTY, ratios: defaultRatios(campaign.platforms), ...(initial || {}) }));
  const [library, setLibrary] = useState({ assets: [], settings: null });
  const [loaded, setLoaded] = useState(false);
  const [paste, setPaste] = useState(() => (initial?.texts === 'given' && initial.given_texts?.length ? initial.given_texts.map((t, i) => `${i + 1}) ${[t.headline, t.subline, t.badge].filter(Boolean).join('\n')}`).join('\n\n') : ''));
  const [editRow, setEditRow] = useState(-1);
  const [cardOpen, setCardOpen] = useState(false);
  const [editKey, setEditKey] = useState('');
  const [more, setMore] = useState(() => !!(initial && (initial.audience || initial.message || initial.must || initial.avoid || initial.tone || initial.competitors || initial.examples)));
  const [ask, setAsk] = useState({ text: '', skipped: false });
  const [startEmpty, setStartEmpty] = useState(false); // the card was empty when the form opened: the ask stays until the person is done, though a file is added meanwhile
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useDialogA11y(box, onClose);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  // The client's card comes from the project («Креативи»): a new request starts from it, with all its materials taken (not when it is a copy of an older request).
  useEffect(() => {
    let off = false;
    fetchProjectCreative(campaign.project_id).then((d) => {
      if (off) return;
      setLibrary(d);
      const inp = d.settings.inputs || {};
      setStartEmpty(!body(inp.business) && !d.assets.length && !String(d.settings.restrictions || '').trim() && !String(d.settings.figma_url || '').trim());
      if (!initial) setF((x) => ({ ...x, figma: x.figma || d.settings.figma_url || '', cta: d.settings.cta_mode !== 'none', cta_text: x.cta_text || d.settings.cta_text || '', materials: x.materials.length ? x.materials : d.assets.slice(0, MAX_MATERIALS).map((a) => ({ name: a.name, url: a.url, path: a.path, kind: a.kind })) }));
    }).catch(() => {}).finally(() => { if (!off) setLoaded(true); }); // no access or the tables are not there yet: the form simply starts empty
    return () => { off = true; };
  }, [campaign.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = library.settings || {};
  const inputs = settings.inputs || {};
  const cardRows = useMemo(() => ([
    { key: 'product', k: 'Оффер', v: body(inputs.business), item: inputs.business },
    { key: 'audience', k: 'Аудиторія', v: body(inputs.audience), item: inputs.audience },
    { key: 'avoid', k: 'Чого не можна', v: String(settings.restrictions || '').trim() },
    { key: 'cta', k: 'Кнопка', v: settings.cta_mode === 'none' ? 'Не потрібна (естетика)' : `Потрібна${settings.cta_text ? `: «${settings.cta_text}»` : ''}` },
    { key: 'figma', k: 'Макет Figma', v: String(settings.figma_url || '').replace(/^https?:\/\/(www\.)?/, '') },
    { key: 'competitors', k: 'Конкуренти', v: body(inputs.competitors), item: inputs.competitors },
  ].filter((r) => r.v)), [settings, inputs]);
  const showAsk = loaded && startEmpty && !ask.skipped;
  const given = f.texts === 'given';
  const picked = (a) => f.materials.some((m) => m.url === a.url);
  const toggleAsset = (a) => set({ materials: picked(a) ? f.materials.filter((m) => m.url !== a.url) : [...f.materials, { name: a.name, url: a.url, path: a.path, kind: a.kind }].slice(0, MAX_MATERIALS) });
  const shots = f.materials.filter((m) => m.kind === 'competitor');
  const toggleRatio = (key) => set({ ratios: f.ratios.includes(key) ? f.ratios.filter((r) => r !== key) : [...f.ratios, key] });
  const setText = (i, patch) => set({ given_texts: f.given_texts.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  function setGiven(on) {
    if (on) { set({ texts: 'given', given_texts: f.given_texts.length ? f.given_texts : [] }); return; }
    set({ texts: 'yes' });
  }
  // ready texts: what is pasted is split into rows at once (headline, subline, badge by the lines), no separate step
  function onPaste(value) {
    setPaste(value);
    const rows = parseGivenTexts(value);
    set({ given_texts: rows.slice(0, MAX_GIVEN_TEXTS) });
  }

  async function addAssets(list, kind = 'product') {
    setError(''); setBusy('asset');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadAsset(campaign.project_id, file, kind, email));
      setLibrary((l) => ({ ...l, assets: [...l.assets, ...added] }));
      setF((x) => ({ ...x, materials: [...x.materials, ...added.map((a) => ({ name: a.name, url: a.url, path: a.path, kind: a.kind }))].slice(0, MAX_MATERIALS) }));
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (assetInput.current) assetInput.current.value = ''; }
  }
  async function addShots(list) {
    setError(''); setBusy('shot');
    try {
      const added = [];
      for (const file of [...list]) added.push(await uploadMaterial(campaign.id, file, 'competitor'));
      setF((x) => ({ ...x, materials: [...x.materials, ...added].slice(0, MAX_MATERIALS) }));
    } catch (e) { setError(e.message || 'Не вдалося завантажити файл.'); } finally { setBusy(''); if (shotInput.current) shotInput.current.value = ''; }
  }

  async function submit(start) {
    setError('');
    const req = { ...f, product: f.product || ask.text.trim() };
    try { cleanRequest(req); } catch (e) { setError(e.message); return; }
    setBusy(start ? 'start' : 'save');
    try {
      if (ask.text.trim()) await saveInput(campaign.project_id, 'business', ask.text.trim(), email).catch(() => {}); // what we sell goes to the card, so the next request does not ask again
      await onSave(req, start);
    } catch (e) { setError(e.message || 'Не вдалося зберегти запит.'); setBusy(''); }
  }

  const materialsOn = library.assets.filter(picked).length;
  const cardLine = [...cardRows.map((r) => r.k.toLowerCase()).filter((k) => k !== 'конкуренти'), library.assets.length ? `${materialsOn} з ${library.assets.length} матеріалів` : ''].filter(Boolean).join(', ');

  return (
    <div className="cmp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="cmp-wizard stu-form qr" role="dialog" aria-modal="true" aria-labelledby="stu-form-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div><span className="cmp-kicker">Креативна студія · {campaign.name}</span><h2 id="stu-form-title">Новий запит на креативи</h2></div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={!!busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="cmp-wiz-body qr-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}

          <div className="qr-comp">
            <label htmlFor="stu-goal" className="qr-lab">Що потрібно</label>
            <textarea id="stu-goal" className="qr-area" rows={given ? 2 : 3} value={f.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={3000} placeholder="Опишіть своїми словами: для чого креативи, до якої дати, що важливо" autoFocus />
            <div className="qr-foot"><span>{f.goal.length} / 3000</span></div>
            <span className="qr-mic" title="Голосом або текстом, скоро"><i>скоро</i><b aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></b></span>
          </div>

          <div className="qr-card qr-prm">
            <div className="qr-g">
              <span className="qr-lab">Напрямів</span>
              {given ? <span className="stu-chip on">{f.given_texts.length || 0} · за текстами</span> : (
                <span className="qr-step"><button type="button" aria-label="Менше" disabled={f.count <= 1} onClick={() => set({ count: Math.max(1, f.count - 1) })}>−</button><b>{f.count}</b><button type="button" aria-label="Більше" disabled={f.count >= MAX_CONCEPTS} onClick={() => set({ count: Math.min(MAX_CONCEPTS, f.count + 1) })}>+</button></span>
              )}
            </div>
            <div className="qr-g">
              <span className="qr-lab">Формати</span>
              <div className="stu-chips" role="group" aria-label="Формати">
                {REQUEST_RATIOS.map((r) => <button key={r.key} type="button" className={'stu-chip' + (f.ratios.includes(r.key) ? ' on' : '')} aria-pressed={f.ratios.includes(r.key)} onClick={() => toggleRatio(r.key)}>{r.key}</button>)}
              </div>
            </div>
            <div className="qr-g">
              <button type="button" className={'qr-sw' + (given ? ' on' : '')} role="switch" aria-checked={given} onClick={() => setGiven(!given)}><i /><span>У мене є готові тексти</span></button>
            </div>
          </div>

          {given && (
            <div className="qr-card qr-texts">
              <div className="qr-head"><b>Мої тексти</b>{f.given_texts.length > 0 && <span className="qr-ok"><i />Розпізнано {f.given_texts.length}, кожен стане окремим креативом</span>}</div>
              <textarea className="qr-paste" rows={f.given_texts.length ? 5 : 7} value={paste} onChange={(e) => onPaste(e.target.value)} aria-label="Усі тексти разом" placeholder={PASTE_HINT} />
              {f.given_texts.length > 0 && (
                <div className="qr-rows">
                  {f.given_texts.map((t, i) => (editRow === i ? (
                    <div key={i} className="qr-row is-edit">
                      <b>{i + 1}</b>
                      <input className="cmp-input" value={t.headline} onChange={(e) => setText(i, { headline: e.target.value })} placeholder="Заголовок" aria-label={`Текст ${i + 1}: заголовок`} maxLength={120} />
                      <input className="cmp-input" value={t.subline} onChange={(e) => setText(i, { subline: e.target.value })} placeholder="Підзаголовок" aria-label={`Текст ${i + 1}: підзаголовок`} maxLength={240} />
                      <input className="cmp-input" value={t.badge} onChange={(e) => setText(i, { badge: e.target.value })} placeholder="Плашка" aria-label={`Текст ${i + 1}: плашка`} maxLength={60} />
                      <button type="button" className="qr-ico" aria-label="Готово" onClick={() => setEditRow(-1)}><ActionIcon name="select" size={15} /></button>
                    </div>
                  ) : (
                    <div key={i} className="qr-row">
                      <b>{i + 1}</b><strong>{t.headline || '—'}</strong><span>{t.subline}</span>{t.badge ? <em>{t.badge}</em> : <em className="is-none">без плашки</em>}
                      <button type="button" className="qr-ico" aria-label={`Правити текст ${i + 1}`} onClick={() => setEditRow(i)}><ActionIcon name="edit" size={15} /></button>
                    </div>
                  )))}
                </div>
              )}
              <p className="qr-mut">Тексти використаємо дослівно, до {MAX_GIVEN_TEXTS}. Порядок «заголовок, підзаголовок, плашка» розпізнано за рядками; олівцем можна поправити будь-який.</p>
            </div>
          )}

          {showAsk && (
            <div className="qr-ask">
              <p className="qr-top"><b>Картка проєкту ще не заповнена.</b> Щоб креативи були точними, дайте мінімум: що продаємо і логотип або фото продукту.</p>
              <div className="qr-askf">
                <label htmlFor="qr-sell" className="qr-lab">Що продаємо</label>
                <input id="qr-sell" className="cmp-input" value={ask.text} onChange={(e) => setAsk((a) => ({ ...a, text: e.target.value }))} maxLength={1500} placeholder="Що продаємо й чим відрізняється, один-два рядки" />
              </div>
              <div className="qr-askf">
                <span className="qr-lab">Матеріали</span>
                <div className="qr-drop">
                  <input ref={assetInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addAssets(e.target.files, assetInput.current?.dataset.kind || 'product')} />
                  <button type="button" className="qr-slot" disabled={!!busy} onClick={() => { assetInput.current.dataset.kind = 'logo'; assetInput.current.click(); }}>+ Логотип</button>
                  <button type="button" className="qr-slot" disabled={!!busy} onClick={() => { assetInput.current.dataset.kind = 'product'; assetInput.current.click(); }}>+ Фото продукту</button>
                  {library.assets.length > 0 && <span className="qr-mut">Додано: {library.assets.length}</span>}
                </div>
              </div>
              <p className="qr-fine">Збережемо це в картку проєкту, щоб наступного разу не питати. PNG, JPG або WebP до {MAX_FILE_MB} МБ. Не хочете зараз: запускайте, агент зробить без референсів, менш точно. <button type="button" className="qr-link" onClick={() => setAsk((a) => ({ ...a, skipped: true }))}>{ask.text.trim() || library.assets.length ? 'Готово' : 'Пропустити'}</button></p>
            </div>
          )}

          {!showAsk && loaded && (
            <div className="qr-card qr-fc">
              <div className="qr-fctop">
                <span className="qr-fcico" aria-hidden="true"><ActionIcon name="data" size={16} /></span>
                <div className="qr-fctx"><b>Використаємо з картки проєкту:</b> {cardLine || 'порожньо, тож агент спиратиметься лише на ваше речення'}</div>
                <button type="button" className="cmp-btn" aria-expanded={cardOpen} onClick={() => setCardOpen(!cardOpen)}>{cardOpen ? 'Згорнути' : 'Змінити'}</button>
              </div>
              {cardOpen && (
                <>
                  <div className="qr-lst">
                    {cardRows.map((r) => {
                      const age = ageOf(r.item);
                      return (
                        <div key={r.key} className="qr-l">
                          <span className="qr-k"><i className={age?.old ? 'old' : ''} />{r.k}</span>
                          <span className="qr-v" title={r.v}>{clipText(r.v)}</span>
                          <span className="qr-r">{age && <small className={age.old ? 'old' : ''}>{age.text}</small>}{r.key !== 'competitors' && <button type="button" className="qr-link" onClick={() => setEditKey(editKey === r.key ? '' : r.key)}>змінити</button>}</span>
                          {editKey === r.key && (
                            <div className="qr-edit">
                              {r.key === 'cta' ? (
                                <>
                                  <Chips label="Кнопка заклику до дії" value={f.cta ? 'yes' : 'no'} options={[['yes', 'Потрібна'], ['no', 'Не потрібна (естетика)']]} onPick={(k) => set({ cta: k === 'yes' })} />
                                  {f.cta && <input className="cmp-input" value={f.cta_text} onChange={(e) => set({ cta_text: e.target.value })} placeholder="Текст кнопки, наприклад: Shop now" aria-label="Текст кнопки" maxLength={40} />}
                                </>
                              ) : r.key === 'figma' ? (
                                <input className="cmp-input" value={f.figma} onChange={(e) => set({ figma: e.target.value })} placeholder="https://www.figma.com/design/…" aria-label="Макет у Figma" maxLength={300} />
                              ) : (
                                <textarea className="cmp-input" rows={2} value={f[r.key]} onChange={(e) => set({ [r.key]: e.target.value })} placeholder="Лише для цього запиту; порожньо означає «беремо з картки»" aria-label={r.k} maxLength={1500} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="qr-mat">
                    <span className="qr-k"><i />Матеріали · {materialsOn} з {library.assets.length}</span>
                    <div className="qr-ths">
                      {library.assets.map((a) => (
                        <button key={a.id} type="button" className={'qr-th' + (picked(a) ? '' : ' off')} aria-pressed={picked(a)} onClick={() => toggleAsset(a)} title={`${a.name}: ${picked(a) ? 'береться' : 'не береться'}`}>
                          <img src={a.url} alt="" loading="lazy" /><small>{ASSET_KINDS[a.kind] || a.kind}</small>
                        </button>
                      ))}
                      <input ref={assetInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addAssets(e.target.files, 'product')} />
                      <button type="button" className="qr-add" disabled={!!busy || f.materials.length >= MAX_MATERIALS} onClick={() => assetInput.current?.click()}><span>{busy === 'asset' ? '…' : '+ файл'}</span></button>
                    </div>
                  </div>
                  <p className="qr-mut">Зміна тут стосується лише цього запиту. Блідий матеріал не береться. Щоб змінити картку назавжди, відкрийте вкладку «Креативи» проєкту.</p>
                </>
              )}
            </div>
          )}

          <div className={'qr-ex' + (more ? ' open' : '')}>
            <button type="button" className="qr-bar" aria-expanded={more} onClick={() => setMore(!more)}>
              <span className="qr-chev" aria-hidden="true">▾</span><b>Додатково</b><span className="qr-sub">аудиторія, меседж, тон, чого не можна, конкуренти, джерело ідей, Figma, мова · усе необовʼязкове</span>
            </button>
            {more && (
              <div className="qr-exbody">
                <label className="qr-fl"><span className="qr-lab">Головний меседж</span><input className="cmp-input" value={f.message} onChange={(e) => set({ message: e.target.value })} maxLength={1500} placeholder="Що має запамʼятатись" /></label>
                <label className="qr-fl"><span className="qr-lab">Тон</span><input className="cmp-input" value={f.tone} onChange={(e) => set({ tone: e.target.value })} maxLength={800} placeholder="Тепло, камерно, без пафосу" /></label>
                <label className="qr-fl"><span className="qr-lab">Аудиторія для цього запиту</span><input className="cmp-input" value={f.audience} onChange={(e) => set({ audience: e.target.value })} maxLength={1500} placeholder="Якщо інша, ніж у картці" /></label>
                <label className="qr-fl"><span className="qr-lab">Чого не можна додатково</span><input className="cmp-input" value={f.avoid} onChange={(e) => set({ avoid: e.target.value })} maxLength={1500} placeholder="До обмежень картки" /></label>
                <label className="qr-fl qr-w2"><span className="qr-lab">Обовʼязково</span><input className="cmp-input" value={f.must} onChange={(e) => set({ must: e.target.value })} maxLength={1500} placeholder="Що має бути в креативах" /></label>
                <label className="qr-fl qr-w2"><span className="qr-lab">Конкуренти й реклама конкурентів</span><textarea className="cmp-input" rows={2} value={f.competitors} onChange={(e) => set({ competitors: e.target.value })} maxLength={2000} placeholder="По одному на рядок: назва, сайт або посилання на рекламу" /></label>
                <label className="qr-fl qr-w2"><span className="qr-lab">Опис реклами конкурентів</span><textarea className="cmp-input" rows={2} value={f.examples} onChange={(e) => set({ examples: e.target.value })} maxLength={3000} placeholder="Реклама з бібліотек соцмереж автоматично не читається: вставте посилання чи опишіть" /></label>
                <div className="qr-fl qr-w2">
                  <input ref={shotInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={(e) => addShots(e.target.files)} />
                  <button type="button" className="qr-shots" disabled={!!busy || f.materials.length >= MAX_MATERIALS} onClick={() => shotInput.current?.click()}>{busy === 'shot' ? 'Завантажуємо…' : `+ Скриншоти реклами конкурентів${shots.length ? ` (додано ${shots.length}: ${MATERIAL_KINDS.competitor})` : ''}`}</button>
                </div>
                <div className="qr-fl"><span className="qr-lab">Звідки брати ідеї</span><Chips label="Звідки брати ідеї" value={f.idea_source} options={Object.entries(IDEA_SOURCES)} onPick={(k) => set({ idea_source: k })} /></div>
                <div className="qr-fl"><span className="qr-lab">Мова текстів</span><Chips label="Мова текстів" value={f.language} options={Object.entries(REQUEST_LANGUAGES)} onPick={(k) => set({ language: k })} /></div>
                {!given && <div className="qr-fl qr-w2"><span className="qr-lab">Тексти на креативах</span><Chips label="Тексти на креативах" value={f.texts === 'no' ? 'no' : 'yes'} options={[['yes', 'Напише агент копірайтер'], ['no', 'Без тексту на картинці']]} onPick={(k) => set({ texts: k })} /></div>}
                <p className="qr-mut qr-w2">Порожні поля нічого не змінюють: беремо з картки проєкту.</p>
              </div>
            )}
          </div>
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
