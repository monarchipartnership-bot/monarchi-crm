import { useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/onest/500.css';
import '@fontsource/onest/800.css';
import { paintText } from '../../../lib/creatives/composeText';
import { DEFAULT_MARGIN, TEXT_SIZES, cleanManual, cleanStyle, composerOptions, draftFromStyle, manualFromDraft } from '../../../lib/agents/projectStyle';
import { Spinner } from './parts';
import '../../../styles/styleEditor.css';

const ZONES = [['auto', 'за картинкою'], ['top', 'зверху'], ['center', 'по центру'], ['bottom', 'знизу'], ['left', 'зліва'], ['right', 'справа']];
const PLATES = [['auto', 'за картинкою'], ['on', 'є'], ['off', 'немає']];
const INKS = [['auto', 'за картинкою'], ['light', 'світлий'], ['dark', 'темний']];
const FONT = "'Onest', 'Inter', 'Segoe UI', Arial, sans-serif";
const PREVIEW_W = 560;

function loadPicture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не вдалося завантажити зразок.'));
    img.src = url;
  });
}

// The live preview: the picture with the words over it, drawn by the SAME code as the server uses (paintText), so what is seen here is what the finished creative gets.
function Preview({ sample, text }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');
  const cache = useRef(new Map());
  const opts = useMemo(() => composerOptions(text), [text]);
  useEffect(() => {
    let dead = false;
    setErr('');
    const draw = async () => {
      try {
        let img = cache.current.get(sample.url);
        if (!img) { img = await loadPicture(sample.url); cache.current.set(sample.url, img); }
        try { await document.fonts.load(`800 40px ${FONT}`); await document.fonts.load(`500 30px ${FONT}`); } catch { /* the fallback font is fine */ }
        if (dead || !ref.current) return;
        const k = Math.min(1, PREVIEW_W / img.naturalWidth);
        const W = Math.round(img.naturalWidth * k); const H = Math.round(img.naturalHeight * k);
        const cv = ref.current; cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, W, H);
        paintText(ctx, { W, H, zone: 'left', headline: sample.headline || 'Заголовок вашої акції', cta: sample.cta || 'Купити зараз', font: FONT, style: opts });
      } catch (e) { if (!dead) setErr(e?.message || 'Не вдалося намалювати превʼю.'); }
    };
    const id = setTimeout(draw, 60);
    return () => { dead = true; clearTimeout(id); };
  }, [sample, opts]);
  return (
    <div className="se-pv">
      <canvas ref={ref} role="img" aria-label="Превʼю: картинка з текстом за обраним оформленням" />
      {err && <p className="se-err" role="alert">{err}</p>}
    </div>
  );
}

function Chips({ label, value, options, onPick }) {
  return (
    <div className="se-row" role="group" aria-label={label}>
      <span className="se-lab">{label}</span>
      <div className="se-chips">
        {options.map(([k, name]) => <button key={k} type="button" className={'se-chip' + (value === k ? ' is-on' : '')} aria-pressed={value === k} onClick={() => onPick(k)}>{name}</button>)}
      </div>
    </div>
  );
}

function Slider({ label, value, auto, min, max, step, unit = '%', autoLabel = 'за замовчуванням', onChange, onAuto, fallback }) {
  const shown = auto ? fallback : value;
  return (
    <div className="se-row">
      <span className="se-lab">{label}<b>{auto ? autoLabel : `${shown}${unit}`}</b></span>
      <div className="se-slide">
        <input type="range" min={min} max={max} step={step} value={shown} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
        <button type="button" className={'se-chip' + (auto ? ' is-on' : '')} aria-pressed={auto} onClick={onAuto}>Авто</button>
      </div>
    </div>
  );
}

// «Оформлення тексту на креативах» (owner's mockup, step 3.1d): the style of the words that the scout decided, changed by a person with a live preview on a picture of the project.
//   style: intel.style (effective: { value, text: { zone: { source } ... } })   autoStyle / manual: the scout's decision and what is saved by a person
//   samples: [{ id, url, label, headline, cta }]   onSave(manual) → Promise (an empty object gives the decision back to the scout)
export default function StyleEditor({ autoStyle, manual, samples = [], onSave }) {
  const auto = useMemo(() => cleanStyle(autoStyle).text, [autoStyle]);
  const saved = useMemo(() => cleanManual(manual), [manual]);
  const start = useMemo(() => draftFromStyle(auto, saved.text), [auto, saved]);
  const [draft, setDraft] = useState(start);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(start); }, [start]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const next = useMemo(() => manualFromDraft(draft, auto), [draft, auto]);
  const dirty = JSON.stringify(next) !== JSON.stringify(saved.text);
  const hasManual = Object.keys(saved.text).length > 0;
  const text = useMemo(() => ({ zone: draft.zone, size: draft.size, plate: draft.plate, color: draft.color, margin: draft.margin, ...(draft.plate === 'on' ? { plate_strength: draft.strength } : {}) }), [draft]);
  const sample = samples[Math.min(pick, samples.length - 1)];

  async function save(payload) { setBusy(true); try { await onSave(payload); } finally { setBusy(false); } }
  const badge = dirty ? { cls: 'is-warn', text: 'є незбережені зміни' } : hasManual ? { cls: 'is-manual', text: 'змінено менеджером' } : { cls: '', text: 'вирішила розвідка' };

  return (
    <div className="se">
      <div className="se-head"><b>Оформлення тексту на креативах</b><span className={'ckp-chip ' + badge.cls}>{badge.text}</span></div>
      {!sample && <p className="sd-note">Для превʼю потрібна картинка проєкту. Вона зʼявиться, коли буде перший креатив або фото з сайту.</p>}
      {sample && (
        <div className="se-grid">
          <div className="se-left">
            <Preview sample={sample} text={text} />
            {samples.length > 1 && (
              <ul className="se-samples" aria-label="Зразок картинки для превʼю">
                {samples.map((s, i) => (
                  <li key={s.id}><button type="button" className={i === pick ? 'is-on' : ''} aria-pressed={i === pick} aria-label={`Зразок: ${s.label || 'картинка'}`} onClick={() => setPick(i)}><img src={s.url} alt="" loading="lazy" /></button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="se-ctl">
            <Chips label="Місце тексту" value={draft.zone} options={ZONES} onPick={(zone) => set({ zone })} />
            <Slider label="Розмір" value={typeof draft.size === 'number' ? draft.size : 100} auto={draft.size === 'auto'} min={60} max={140} step={5} fallback={100} autoLabel="стандартний" onChange={(size) => set({ size })} onAuto={() => set({ size: draft.size === 'auto' ? 100 : 'auto' })} />
            <Chips label="Підкладка" value={draft.plate} options={PLATES} onPick={(plate) => set({ plate })} />
            {draft.plate === 'on' && <Slider label="Сила підкладки" value={draft.strength} auto={false} min={10} max={90} step={5} fallback={55} onChange={(strength) => set({ strength })} onAuto={() => set({ strength: 55 })} />}
            <Chips label="Колір тексту" value={draft.color} options={INKS} onPick={(color) => set({ color })} />
            <Slider label="Відступ від краю" value={typeof draft.margin === 'number' ? draft.margin : DEFAULT_MARGIN} auto={draft.margin === 'auto'} min={3} max={15} step={1} fallback={DEFAULT_MARGIN} onChange={(margin) => set({ margin })} onAuto={() => set({ margin: draft.margin === 'auto' ? DEFAULT_MARGIN : 'auto' })} />
            <div className="se-acts">
              <button type="button" className="ckp-btn is-primary" disabled={busy || !dirty} onClick={() => save({ text: next })}>{busy ? <Spinner /> : null}Зберегти для проєкту</button>
              <button type="button" className="ckp-btn" disabled={busy || (!hasManual && !dirty)} onClick={() => { if (dirty && !hasManual) setDraft(start); else save({}); }}>Повернути вибір розвідки</button>
            </div>
            <small className="sd-note">Збережене діє на всіх нових креативах проєкту й не затирається, коли розвідник оновлює профіль. Готові креативи не змінюються.</small>
          </div>
        </div>
      )}
    </div>
  );
}
