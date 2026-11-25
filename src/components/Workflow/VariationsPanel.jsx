import { useMemo, useState } from 'react';
import { requestRun } from '../../lib/api/workflow';
import { ELEMENTS, LANGS, MERGE_MAX, MODES, VAR_MAX } from '../../../api/_lib/wf/skills/variationsEngine.js';

// «Варіації креативу» (Zeely item 3): the manager picks an ad that worked and asks the Creator for versions of it.
//   змінити елементи: the elements that are ticked may change, every other one is locked and stays exactly as it was (the code copies it from the source)
//   об’єднати два: a new ad that takes the strongest part of each
//   локалізувати: the same words in another language, the picture stays
// While an agent proposal waits in the section a new request would be built on the old text, so the panel waits until the manager answers it.
export default function VariationsPanel({ projectId, email, items = [], proposals = 0, onRequested }) {
  const cards = useMemo(() => items.filter((c) => c.headline && c.primary_text), [items]);
  const [mode, setMode] = useState('vary');
  const [src, setSrc] = useState('');
  const [src2, setSrc2] = useState('');
  const [vary, setVary] = useState(['headline', 'angle']);
  const [count, setCount] = useState(3);
  const [lang, setLang] = useState('en');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const first = src || cards[0]?.id || '';
  const second = src2 || cards.find((c) => c.id !== first)?.id || '';
  const maxCount = mode === 'merge' ? MERGE_MAX : VAR_MAX;
  const noPic = mode === 'localize' || (mode === 'vary' && !vary.includes('visual_prompt') && !vary.includes('format'));

  const toggle = (k) => setVary((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const ready = mode === 'vary' ? vary.length > 0 : mode === 'merge' ? first && second && first !== second : !!first;

  async function go() {
    setBusy(true); setErr(''); setMsg('');
    try {
      const input = { mode, ...(mode === 'merge' ? { sources: [first, second] } : { source: first }), ...(mode === 'vary' ? { vary } : {}), ...(mode === 'localize' ? { language: lang } : { count: Math.max(1, Math.min(maxCount, Math.floor(Number(count)) || 3)) }) };
      const ok = await requestRun(projectId, 'creator', 'ad_variations', email, input);
      setMsg(ok ? 'Креатор візьметься за варіації найближчою хвилиною. Нові картки з’являться тут як пропозиція агента: прийміть її.' : 'Попередній запит на варіації ще виконується: дочекайтесь його.');
      if (ok && onRequested) onRequested();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  if (cards.length === 0) return null;
  const pick = (id, value, set, label) => (
    <div className="wf-col" style={{ gap: 4 }}>
      <label htmlFor={id} className="wf-muted" style={{ fontSize: 12.5 }}>{label}</label>
      <select id={id} className="wf-bd-in" value={value} onChange={(e) => set(e.target.value)}>{cards.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.headline}</option>)}</select>
    </div>
  );
  return (
    <div className="wf-card" style={{ background: 'var(--wf-bg)', boxShadow: 'none', marginBottom: 12 }}>
      <h3>Варіації креативу, що спрацював</h3>
      <div className="wf-row" role="group" aria-label="Що зробити" style={{ marginBottom: 10 }}>
        {Object.entries(MODES).map(([k, v]) => <button key={k} type="button" className={'wf-btn sm' + (mode === k ? ' p' : '')} aria-pressed={mode === k} onClick={() => setMode(k)}>{v}</button>)}
      </div>
      <div className="wf-row" style={{ alignItems: 'flex-end' }}>
        {pick('wf-var-src', first, setSrc, mode === 'merge' ? 'Перший креатив' : 'Креатив-джерело')}
        {mode === 'merge' && pick('wf-var-src2', second, setSrc2, 'Другий креатив')}
        {mode === 'localize' && (
          <div className="wf-col" style={{ gap: 4 }}>
            <label htmlFor="wf-var-lang" className="wf-muted" style={{ fontSize: 12.5 }}>Мова</label>
            <select id="wf-var-lang" className="wf-bd-in" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        )}
        {mode !== 'localize' && (
          <div className="wf-col" style={{ gap: 4 }}>
            <label htmlFor="wf-var-count" className="wf-muted" style={{ fontSize: 12.5 }}>Скільки варіантів (до {maxCount})</label>
            <input id="wf-var-count" type="number" min={1} max={maxCount} className="wf-bd-in" style={{ width: 90 }} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
        )}
      </div>
      {mode === 'vary' && (
        <fieldset style={{ border: 0, padding: 0, margin: '10px 0 0' }}>
          <legend className="wf-muted" style={{ fontSize: 12.5, padding: 0, marginBottom: 6 }}>Що можна змінювати (решта залишиться без змін)</legend>
          <div className="wf-row">
            {Object.entries(ELEMENTS).map(([k, v]) => (
              <label key={k} className="wf-row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={vary.includes(k)} onChange={() => toggle(k)} />{vary.includes(k) ? 'змінювати' : 'залишити'}: {v}</label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="wf-row" style={{ marginTop: 12 }}>
        <button type="button" className="wf-btn p" disabled={busy || !ready || proposals > 0} onClick={go}>Створити варіації</button>
      </div>
      <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
        {proposals > 0 ? 'Спершу прийміть або відхиліть пропозицію агента нижче: варіації будуються на поточному тексті розділу.'
          : noPic ? 'Нової картинки не потрібно: варіанти беруть картинку джерела, тож витрат на картинки немає.'
            : 'Потрібні нові картинки: якщо ліміт витрат проєкту менший за замовлене, кількість зменшиться автоматично.'}
      </div>
      {msg && <div className="wf-muted" style={{ marginTop: 8 }} role="status">{msg}</div>}
      {err && <div className="wf-err" style={{ marginTop: 8 }} role="alert">{err}</div>}
    </div>
  );
}
