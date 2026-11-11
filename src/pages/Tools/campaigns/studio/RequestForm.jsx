import { useEffect, useMemo, useRef, useState } from 'react';
import ActionIcon from '../../../../components/common/ActionIcon';
import { useAuth } from '../../../../contexts/AuthContext';
import useDialogA11y from '../../../../lib/useDialogA11y';
import useSpeechInput, { SPEECH_LANGS } from '../../../../lib/useSpeechInput';
import { WEEKDAYS } from '../../../../lib/agents/campaignCycles';
import { CYCLE_AGENT_ROLES, IDEA_SOURCES, MATERIAL_KINDS, MAX_CONCEPTS, MAX_GIVEN_TEXTS, MAX_MATERIALS, REQUEST_LANGUAGES, REQUEST_RATIOS, cleanRequest, creativeRoleDef, cycleAgentFields, parseGivenTexts } from '../../../../lib/agents/creativeTeam';
import { ASSET_KINDS, defaultRatios, inputState, ctaVariants } from '../../../../lib/agents/projectCreative';
import { MIN_FILL_CHARS, applyFill, cardPrefill } from '../../../../lib/agents/cycleFormFill';
import { FILE_TYPES, MAX_FILE_MB, fillCycleForm, uploadMaterial } from '../../../../lib/api/creatives';
import { fetchProjectCreative, saveInput, uploadAsset } from '../../../../lib/api/projectCreative';

const EMPTY = {
  title: '', agent_settings: {}, goal: '', product: '', audience: '', message: '', tone: '', must: '', avoid: '', site: '', competitors: '', examples: '', ratios: ['1:1'], count: 3,
  texts: 'yes', given_texts: [], idea_source: 'mix', figma: '', cta: true, cta_text: '', language: 'uk', materials: [],
};
const EMPTY_TEXT = { headline: '', subline: '', badge: '' };
const PASTE_HINT = 'Вставте всі тексти разом, по три рядки на кожен: заголовок, підзаголовок, плашка.\nТексти розділіть номерами «1)» або порожнім рядком.';

const dropSrc = (src, keys) => { const n = { ...src }; keys.forEach((k) => delete n[k]); return n; };
// a value from the card goes only into what is still empty and was not written by hand
const mergeEmpty = (base = {}, add = {}, skip = () => false) => {
  const out = { ...base };
  Object.entries(add).forEach(([role, mine]) => Object.entries(mine).forEach(([key, v]) => { if (!String(out[role]?.[key] || '').trim() && !skip(role, key)) out[role] = { ...(out[role] || {}), [key]: v }; }));
  return out;
};

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
//   mode 'regular' (owner, 2026-11-11): the same form sets up the REGULAR cycle of the operation: the day and the time of the weekly run are asked too, ready
//   texts and hand-picked files are not (every run takes the current card of the project), and onSave gets (values, startNow, { weekdays, time } | { everyDays, time }).
//   title: the heading of the window; schedule: { weekdays | weekday | everyDays, time } of the regular task that is already saved.
//   allowKind: the person chooses in the form whether the cycle is one-off or regular («Створити додаткове завдання»)
export default function RequestForm({ campaign, initial = null, onClose, onSave, mode = 'extra', title = 'Нове завдання: запит на креативи', schedule = null, canStartNow = true, allowKind = false }) {
  const [kind, setKind] = useState(mode); // extra | regular
  const regular = kind === 'regular';
  const [sched, setSched] = useState(() => ({ kind: schedule?.everyDays ? 'every' : 'week', every: String(schedule?.everyDays || 3), days: (schedule?.weekdays?.length ? schedule.weekdays : schedule?.weekday ? [schedule.weekday] : [1]).map(Number), time: schedule?.time || '09:00', startNow: !schedule && canStartNow })); // canStartNow false: the operation is paused, nothing can start
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
  const [voiceLang, setVoiceLang] = useState('uk'); // the language the person SPEAKS (the language of the texts of the creatives is chosen apart)
  const [openAg, setOpenAg] = useState(() => new Set(CYCLE_AGENT_ROLES.filter((r) => Object.keys(initial?.agent_settings?.[r] || {}).length)));
  // where a value came from ('f.title' / 'a.role.key' → 'card' | 'text') and what the person wrote by hand: a later analysis never overwrites that
  const [src, setSrc] = useState({});
  const touched = useRef(new Set());
  const [an, setAn] = useState({ busy: false, error: '', filled: null, notes: '', skipped: 0 });
  useDialogA11y(box, onClose);
  const set = (patch) => { Object.keys(patch).forEach((k) => touched.current.add(k)); setSrc((s) => dropSrc(s, Object.keys(patch).map((k) => `f.${k}`))); setF((x) => ({ ...x, ...patch })); };
  const fRef = useRef(null);
  // dictation: what is said is added to the end of the description (the field stays editable)
  const speech = useSpeechInput({ lang: voiceLang, onText: (txt) => { if (txt) setF((x) => ({ ...x, goal: `${x.goal}${x.goal && !/\s$/.test(x.goal) ? ' ' : ''}${txt}`.slice(0, 3000) })); } });
  const setAgent = (role, key, value) => { touched.current.add(`${role}.${key}`); setSrc((s) => dropSrc(s, [`a.${role}.${key}`])); setF((x) => ({ ...x, agent_settings: { ...(x.agent_settings || {}), [role]: { ...(x.agent_settings?.[role] || {}), [key]: value } } })); };
  const srcBadge = (k) => (src[k] ? <em className="qr-src" title="Підставлено автоматично: можна виправити">{src[k] === 'card' ? 'з картки проєкту' : 'з вашого опису'}</em> : null);
  const toggleAg = (role) => setOpenAg((cur) => { const n = new Set(cur); if (n.has(role)) n.delete(role); else n.add(role); return n; });

  // The client's card comes from the project («Креативи»): a new request starts from it, with all its materials taken (not when it is a copy of an older request).
  useEffect(() => {
    let off = false;
    fetchProjectCreative(campaign.project_id).then((d) => {
      if (off) return;
      setLibrary(d);
      const inp = d.settings.inputs || {};
      setStartEmpty(!body(inp.business) && !d.assets.length && !String(d.settings.restrictions || '').trim() && !String(d.settings.figma_url || '').trim());
      if (!initial) setF((x) => ({ ...x, figma: x.figma || d.settings.figma_url || '', cta: d.settings.cta_mode !== 'none', cta_text: x.cta_text || ctaVariants(d.settings.cta_text)[0] || '', materials: x.materials.length ? x.materials : d.assets.slice(0, MAX_MATERIALS).map((a) => ({ name: a.name, url: a.url, path: a.path, kind: a.kind })) }));
      if (!initial) {
        const pre = cardPrefill({ campaign, settings: d.settings });
        if (pre.sources.length) {
          setF((x) => ({ ...x, agent_settings: mergeEmpty(x.agent_settings, pre.agent_settings, (role, key) => touched.current.has(`${role}.${key}`)) }));
          setSrc((s) => ({ ...s, ...Object.fromEntries(pre.sources.map((k) => [`a.${k}`, 'card'])) }));
          setOpenAg((cur) => new Set([...cur, ...Object.keys(pre.agent_settings)]));
        }
      }
    }).catch(() => {}).finally(() => { if (!off) setLoaded(true); }); // no access or the tables are not there yet: the form simply starts empty
    return () => { off = true; };
  }, [campaign.project_id]); // eslint-disable-line react-hooks/exhaustive-deps

  fRef.current = f;
  const settings = library.settings || {};
  const inputs = settings.inputs || {};
  const cardRows = useMemo(() => ([
    { key: 'product', k: 'Оффер', v: body(inputs.business), item: inputs.business },
    { key: 'audience', k: 'Аудиторія', v: body(inputs.audience), item: inputs.audience },
    { key: 'avoid', k: 'Чого не можна', v: String(settings.restrictions || '').trim() },
    { key: 'cta', k: 'Кнопка', v: settings.cta_mode === 'none' ? 'Не потрібна (естетика)' : `Потрібна${ctaVariants(settings.cta_text).length ? `: «${ctaVariants(settings.cta_text).join('» / «')}»` : ''}` },
    { key: 'figma', k: 'Макет Figma', v: String(settings.figma_url || '').replace(/^https?:\/\/(www\.)?/, '') },
    { key: 'competitors', k: 'Конкуренти', v: body(inputs.competitors), item: inputs.competitors },
  ].filter((r) => r.v)), [settings, inputs]);
  const showAsk = loaded && startEmpty && !ask.skipped;
  const given = f.texts === 'given' && !regular; // ready texts are for a one-off cycle only
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

  // «Проаналізувати й заповнити»: the description (typed or dictated) and the card go to the model; the answer fills the fields and the settings of the agents of this cycle
  async function analyse() {
    setAn({ busy: true, error: '', filled: null, notes: '', skipped: 0 });
    try {
      const fill = await fillCycleForm({ campaignId: campaign.id, text: fRef.current.goal });
      const r = applyFill({ current: fRef.current, fill, touched: touched.current });
      setF((x) => ({ ...x, ...r.patch, agent_settings: r.agent_settings }));
      setSrc((s) => ({ ...s, ...Object.fromEntries(r.sources.map((k) => [k, 'text'])) }));
      setOpenAg((cur) => new Set([...cur, ...Object.keys(fill.agent_settings || {})]));
      if (['audience', 'message', 'tone', 'must', 'avoid'].some((k) => r.patch[k])) setMore(true);
      if (fill.fields.product && startEmpty && !ask.skipped && !ask.text.trim() && !touched.current.has('product')) setAsk((a) => ({ ...a, text: fill.fields.product })); // «що продаємо» of the empty card
      setAn({ busy: false, error: '', filled: r.filled, notes: fill.notes || '', skipped: r.skipped });
    } catch (e) { setAn({ busy: false, error: e?.message || 'Не вдалося проаналізувати опис.', filled: null, notes: '', skipped: 0 }); }
  }

  async function submit(start) {
    setError('');
    const req = { ...f, product: f.product || ask.text.trim() };
    try { cleanRequest(req); } catch (e) { setError(e.message); return; }
    if (regular && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(sched.time.trim())) { setError('Час запуску має бути у форматі ГГ:ХХ, наприклад 09:00.'); return; }
    setBusy(start ? 'start' : 'save');
    try {
      if (ask.text.trim()) await saveInput(campaign.project_id, 'business', ask.text.trim(), email).catch(() => {}); // what we sell goes to the card, so the next request does not ask again
      await (regular ? onSave(req, start, sched.kind === 'every' ? { everyDays: Number(sched.every), time: sched.time.trim() } : { weekdays: sched.days, time: sched.time.trim() }) : onSave(req, start));
    } catch (e) { setError(e.message || 'Не вдалося зберегти запит.'); setBusy(''); }
  }

  const total = (given ? f.given_texts.length : f.count) * Math.max(1, f.ratios.length);
  const materialsOn = library.assets.filter(picked).length;
  const cardLine = [...cardRows.map((r) => r.k.toLowerCase()).filter((k) => k !== 'конкуренти'), library.assets.length ? `${materialsOn} з ${library.assets.length} матеріалів` : ''].filter(Boolean).join(', ');

  return (
    <div className="cmp-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="cmp-wizard stu-form qr" role="dialog" aria-modal="true" aria-labelledby="stu-form-title" tabIndex={-1}>
        <header className="cmp-wiz-head">
          <div><span className="cmp-kicker">Креативна студія · {campaign.name}</span><h2 id="stu-form-title">{regular ? 'Регулярне завдання: що робити щотижня' : allowKind ? 'Створити додаткове завдання' : title}</h2></div>
          <button type="button" className="cmp-x" onClick={onClose} disabled={!!busy} aria-label="Закрити"><ActionIcon name="close" size={20} /></button>
        </header>
        <div className="cmp-wiz-body qr-body">
          {error && <p className="cmp-error" role="alert">{error}</p>}

          {/* 1. the name and the kind of the cycle */}
          <div className="qr-card">
            <h4 className="qr-h">Основне</h4>
            <label htmlFor="stu-name" className="qr-lab">Назва завдання {srcBadge('f.title')}</label>
            <input id="stu-name" className="cmp-input" value={f.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} placeholder="Наприклад: Осінній розпродаж, нова колекція (порожньо: назвемо за описом)" autoFocus={!initial} />
            {allowKind && (
              <div className="qr-g qr-wrap">
                <span className="qr-lab">Тип завдання</span>
                <Chips label="Тип завдання" value={kind} options={[['extra', 'Одноразовий'], ['regular', 'Регулярний (щотижня)']]} onPick={setKind} />
              </div>
            )}
            {allowKind && <p className="qr-mut">{regular ? 'Запускатиметься само за розкладом (щотижня або кожні N днів), з однаковими параметрами.' : 'Запускається один раз, зараз. Параметри діють лише для цього завдання.'}</p>}
            {regular && (
              <div className="qr-g qr-wrap">
                <span className="qr-lab">Запускати</span>
                <select className="cmp-input ccx-select" value={sched.kind} onChange={(e) => setSched((s) => ({ ...s, kind: e.target.value }))} aria-label="Як часто"><option value="week">Щотижня</option><option value="every">Кожні N днів</option></select>
                {sched.kind === 'every'
                  ? <><input className="cmp-input ccx-time" type="number" min="1" max="60" value={sched.every} onChange={(e) => setSched((s) => ({ ...s, every: e.target.value }))} aria-label="Кожні скільки днів" /><span className="qr-mut">дн.</span></>
                  : <span className="qr-days" role="group" aria-label="Дні тижня">{WEEKDAYS.map((d, i) => <button key={d} type="button" aria-pressed={sched.days.includes(i + 1)} className={'cmp-btn' + (sched.days.includes(i + 1) ? ' cmp-btn--primary' : '')} onClick={() => setSched((s) => ({ ...s, days: s.days.includes(i + 1) ? s.days.filter((x) => x !== i + 1) : [...s.days, i + 1].sort((a, b) => a - b) }))}>{d.slice(0, 2)}</button>)}</span>}
                <input className="cmp-input ccx-time" type="text" inputMode="numeric" value={sched.time} onChange={(e) => setSched((s) => ({ ...s, time: e.target.value }))} placeholder="09:00" aria-label="Час запуску (Київ)" />
                <button type="button" className={'qr-sw' + (sched.startNow ? ' on' : '')} role="switch" aria-checked={sched.startNow} disabled={!canStartNow} title={canStartNow ? '' : 'Операція на паузі: перше завдання почнеться за розкладом після відновлення'} onClick={() => setSched((s) => ({ ...s, startNow: !s.startNow }))}><i /><span>{canStartNow ? 'Запустити перше завдання одразу' : 'Операція на паузі: запуск за розкладом після відновлення'}</span></button>
              </div>
            )}
          </div>

          {/* 2. what is needed: typed or dictated */}
          <div className="qr-comp">
            <label htmlFor="stu-goal" className="qr-lab">Що потрібно</label>
            <textarea id="stu-goal" className="qr-area" rows={given ? 2 : 4} value={f.goal} onChange={(e) => set({ goal: e.target.value })} maxLength={3000} placeholder="Напишіть або надиктуйте своїми словами: для чого креативи, до якої дати, що важливо" autoFocus={!!initial} />
            {speech.listening && <p className="qr-live" role="status">Слухаю… {speech.interim}</p>}
            {speech.error && <p className="qr-liveerr" role="alert">{speech.error}</p>}
            <div className="qr-foot qr-footrow">
              <span>{f.goal.length} / 3000</span>
              <button type="button" className="cmp-btn cmp-btn--primary qr-ana" disabled={an.busy || f.goal.trim().length < MIN_FILL_CHARS} onClick={analyse} title={f.goal.trim().length < MIN_FILL_CHARS ? 'Спершу опишіть завдання хоча б одним-двома реченнями' : 'Агент розбере опис разом із карткою проєкту й заповнить поля'}>{an.busy ? 'Аналізуємо…' : '✦ Проаналізувати й заповнити поля'}</button>
            </div>
            <div className="qr-mic is-live">
              {speech.supported ? (
                <>
                  <select className="qr-miclang" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} disabled={speech.listening} aria-label="Мова, якою ви говорите">{SPEECH_LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
                  <button type="button" className={'qr-micbtn' + (speech.listening ? ' on' : '')} onClick={speech.toggle} aria-pressed={speech.listening} aria-label={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'} title={speech.listening ? 'Зупинити запис' : 'Надиктувати голосом'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  </button>
                </>
              ) : <span className="qr-micoff" title="Цей браузер не вміє розпізнавати мову. Відкрийте CRM у Chrome, Edge або Safari.">голос: потрібен Chrome, Edge або Safari</span>}
            </div>
          </div>

          {an.error && <p className="cmp-error" role="alert">{an.error}</p>}
          {an.filled && (
            <div className="qr-card qr-ansbox" role="status">
              <p><b>Заповнено з вашого опису:</b> {an.filled.length ? `${an.filled.join(', ')}.` : 'нічого нового.'}{an.skipped > 0 ? ` Не змінював ${an.skipped} ${an.skipped === 1 ? 'поле' : 'полів'}, які ви вписали самі.` : ''}</p>
              {an.notes && <p><b>Перевірте:</b> {an.notes}</p>}
              <p className="qr-mut">Усе підставлено як чернетку: нижче можна виправити будь-яке поле.</p>
            </div>
          )}

          {/* 3. the creatives: how many, which formats, the texts */}
          <div className="qr-card">
            <h4 className="qr-h">Креативи</h4>
            <div className="qr-prm qr-prm0">
              <div className="qr-g">
                <span className="qr-lab">Напрямів (ідей)</span>
                {given ? <span className="stu-chip on">{f.given_texts.length || 0} · за текстами</span> : (
                  <span className="qr-step"><button type="button" aria-label="Менше" disabled={f.count <= 1} onClick={() => set({ count: Math.max(1, f.count - 1) })}>−</button><b>{f.count}</b><button type="button" aria-label="Більше" disabled={f.count >= MAX_CONCEPTS} onClick={() => set({ count: Math.min(MAX_CONCEPTS, f.count + 1) })}>+</button></span>
                )}
              </div>
              <div className="qr-g">
                <span className="qr-lab">Формати</span>
                <div className="stu-chips" role="group" aria-label="Формати">
                  {REQUEST_RATIOS.map((r) => <button key={r.key} type="button" className={'stu-chip' + (f.ratios.includes(r.key) ? ' on' : '')} aria-pressed={f.ratios.includes(r.key)} onClick={() => toggleRatio(r.key)} title={r.label}>{r.key}</button>)}
                </div>
              </div>
            </div>
            <p className="qr-total"><b>Разом: {total} {total === 1 ? 'креатив' : total > 1 && total < 5 ? 'креативи' : 'креативів'}</b> <span>({given ? f.given_texts.length || 0 : f.count} {(given ? f.given_texts.length : f.count) === 1 ? 'напрям' : 'напрями'} × {f.ratios.length || 1} {f.ratios.length === 1 ? 'формат' : 'формати'}). Кожен напрям робиться в кожному вибраному форматі.</span></p>
            {total > 12 && <p className="qr-mut">Багато креативів: генерація картинок платна. Ціну покажемо до запуску, а стелю витрат цього завдання можна задати нижче, в налаштуваннях агента «Креативщик».</p>}
            <div className="qr-g qr-wrap">
              <span className="qr-lab">Тексти на креативах</span>
              <Chips label="Тексти на креативах" value={given ? 'given' : f.texts === 'no' ? 'no' : 'yes'} options={[['yes', 'Напише агент копірайтер'], ['no', 'Без тексту на картинці'], ...(regular ? [] : [['given', 'Мої готові тексти']])]} onPick={(k) => (k === 'given' ? setGiven(true) : set({ texts: k }))} />
            </div>
            <div className="qr-g qr-wrap">
              <span className="qr-lab">Мова текстів</span>
              <Chips label="Мова текстів" value={f.language} options={Object.entries(REQUEST_LANGUAGES)} onPick={(k) => set({ language: k })} />
              <button type="button" className={'qr-sw' + (f.cta ? ' on' : '')} role="switch" aria-checked={f.cta} onClick={() => set({ cta: !f.cta })}><i /><span>Кнопка заклику до дії</span></button>
              {f.cta && <input className="cmp-input qr-ctain" value={f.cta_text} onChange={(e) => set({ cta_text: e.target.value })} placeholder="Текст кнопки, наприклад: Shop now" aria-label="Текст кнопки" maxLength={40} />}
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
                <div className="qr-fctx"><b>{regular ? 'Кожен запуск бере актуальні дані й файли з картки проєкту:' : 'Використаємо з картки проєкту:'}</b> {cardLine || 'порожньо, тож агент спиратиметься лише на ваше речення'}</div>
                {!regular && <button type="button" className="cmp-btn" aria-expanded={cardOpen} onClick={() => setCardOpen(!cardOpen)}>{cardOpen ? 'Згорнути' : 'Змінити'}</button>}
              </div>
              {cardOpen && !regular && (
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

          {/* 4. what each agent is asked for THIS cycle only */}
          <div className="qr-card qr-agents">
            <h4 className="qr-h">Налаштування агентів для цього завдання</h4>
            <p className="qr-mut">Поля підставляються з картки проєкту й з вашого опису (кнопка «Проаналізувати й заповнити» вище), їх можна виправити. Агент врахує це лише в цьому завданні й вважатиме важливішим за свої загальні налаштування. Порожнє поле нічого не змінює.</p>
            {CYCLE_AGENT_ROLES.map((role) => {
              const def = creativeRoleDef(role);
              const fields = cycleAgentFields(role);
              if (!def || !fields.length) return null;
              const mine = f.agent_settings?.[role] || {};
              const filled = fields.filter((fd) => (fd.type === 'check' ? mine[fd.key] === true : String(mine[fd.key] || '').trim())).length;
              const open = openAg.has(role);
              return (
                <div key={role} className={'qr-ag' + (open ? ' open' : '')}>
                  <button type="button" className="qr-bar" aria-expanded={open} onClick={() => toggleAg(role)}>
                    <span className="qr-chev" aria-hidden="true">▾</span><b>{def.name}</b><span className="qr-sub">{def.short}{filled ? ` · заповнено: ${filled}` : ''}</span>
                  </button>
                  {open && (
                    <div className="qr-exbody">
                      {fields.map((fd) => (fd.type === 'check' ? (
                        <div key={fd.key} className="qr-fl qr-w2">
                          <button type="button" className={'qr-sw' + (mine[fd.key] === true ? ' on' : '')} role="switch" aria-checked={mine[fd.key] === true} onClick={() => setAgent(role, fd.key, mine[fd.key] !== true)}><i /><span>{fd.label}</span></button>
                          {fd.hint && <small className="qr-mut">{fd.hint}</small>}
                        </div>
                      ) : (
                        <label key={fd.key} className={'qr-fl' + (fd.type === 'textarea' ? ' qr-w2' : '')}>
                          <span className="qr-lab">{fd.key === 'max_usd' ? 'Ліміт витрат Higgsfield на це завдання, $' : fd.label} {srcBadge(`a.${role}.${fd.key}`)}</span>
                          {fd.type === 'textarea'
                            ? <textarea className="cmp-input" rows={3} value={mine[fd.key] || ''} onChange={(e) => setAgent(role, fd.key, e.target.value)} maxLength={1500} />
                            : <input className="cmp-input" inputMode={fd.key === 'max_usd' ? 'decimal' : undefined} value={mine[fd.key] || ''} onChange={(e) => setAgent(role, fd.key, e.target.value)} maxLength={fd.key === 'max_usd' ? 8 : 300} placeholder={fd.key === 'max_usd' ? 'порожньо: ліміт агента' : ''} />}
                          {fd.hint && <small className="qr-mut">{fd.hint}</small>}
                        </label>
                      )))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

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
                <p className="qr-mut qr-w2">Порожні поля нічого не змінюють: беремо з картки проєкту.</p>
              </div>
            )}
          </div>
        </div>
        <footer className="cmp-wiz-foot">
          <span className="cmp-foot-note">{regular ? 'Агенти запускатимуться самі за розкладом. Картинки генеруються лише після вашого підтвердження вартості; готове йде на ваше затвердження.' : !canStartNow ? 'Операція на паузі: завдання можна лише зберегти як чернетку, запустити його можна після відновлення операції.' : 'Нічого не публікується й не завантажується в рекламні кабінети: результат іде на ваше затвердження.'}</span>
          {!regular && <button type="button" className="cmp-btn" disabled={!!busy} onClick={() => submit(false)}>{busy === 'save' ? 'Зберігаємо…' : 'Зберегти чернетку'}</button>}
          {regular
            ? <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy} onClick={() => submit(sched.startNow)}>{busy ? 'Зберігаємо…' : sched.startNow ? 'Зберегти й запустити перше завдання' : 'Зберегти регулярне завдання'}</button>
            : <button type="button" className="cmp-btn cmp-btn--primary" disabled={!!busy || !canStartNow} title={canStartNow ? '' : 'Операція на паузі'} onClick={() => submit(true)}>{busy === 'start' ? 'Запускаємо…' : 'Створити й запустити'}</button>}
        </footer>
      </div>
    </div>
  );
}
