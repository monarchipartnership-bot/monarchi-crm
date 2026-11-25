import { useEffect, useRef, useState } from 'react';
import Select from '../common/Select';
import { ACCEPT, MAX_FILES, extractBrief } from '../../lib/api/briefExtract';
import { SPEC, conflictOf } from '../../lib/workflow/briefExtract';

// «Розкажіть про клієнта своїми словами»: a text, a dictation or files go to the model; the code checks every quote and number; the manager looks at what was found and
// accepts it into the form of the brief. Nothing is saved here: the accepted facts fill the page and the brief is saved with its own button.
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export default function BriefImport({ form, extra, language = 'uk', onApply, head = null }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [rows, setRows] = useState([]); // the choices: one per fact / product / offer / goal
  const [done, setDone] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* the page is closed */ } }, []);

  function dictate() {
    if (listening) { recRef.current?.stop(); return; }
    if (!SR) { setErr('Диктування працює в Chrome і Edge. У іншому браузері натисніть мікрофон на клавіатурі телефона чи компʼютера.'); return; }
    const rec = new SR();
    rec.lang = language === 'en' ? 'en-US' : 'uk-UA'; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => { let fin = ''; for (let i = e.resultIndex; i < e.results.length; i += 1) if (e.results[i].isFinal) fin += e.results[i][0].transcript; if (fin.trim()) setText((t) => (t.trim() ? t.trim() + ' ' : '') + fin.trim()); };
    rec.onerror = (e) => { setListening(false); setErr(e.error === 'not-allowed' ? 'Браузер не дав доступ до мікрофона: дозвольте його в налаштуваннях сайту.' : 'Диктування зупинилось: ' + (e.error || 'помилка')); };
    rec.onend = () => setListening(false);
    recRef.current = rec; setErr(''); setListening(true); rec.start();
  }

  async function analyse() {
    setBusy(true); setErr(''); setDone(''); setRes(null);
    try {
      const r = await extractBrief({ text, files, language });
      setRes(r);
      setRows([
        ...r.facts.map((f) => { const c = conflictOf(f, form, extra); return { type: 'fact', key: f.key, value: f.value, conflict: c, mode: c ? 'skip' : f.state === 'ok' ? 'set' : 'skip' }; }),
        ...r.products.map((p) => ({ type: 'product', name: p.name, price: p.price, cogs: p.cogs, mode: p.state === 'ok' ? 'set' : 'skip' })),
        ...r.offers.map((o) => ({ type: 'offer', name: o.name, pays: o.pays, mode: o.state === 'ok' ? 'set' : 'skip' })),
        ...r.goals.map((g) => ({ type: 'goal', goal: g.goal, product: g.product, mode: g.state === 'ok' ? 'set' : 'skip' })),
      ]);
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }
  const upd = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function apply(withNotes) {
    const on = rows.filter((x) => x.mode !== 'skip');
    const chosen = {
      facts: on.filter((x) => x.type === 'fact').map((x) => ({ key: x.key, value: x.value, mode: x.mode })),
      products: on.filter((x) => x.type === 'product').map((x) => ({ name: x.name, price: x.price, cogs: x.cogs })),
      offers: on.filter((x) => x.type === 'offer').map((x) => ({ name: x.name, pays: x.pays })),
      goals: on.filter((x) => x.type === 'goal').map((x) => ({ goal: x.goal, product: x.product })),
      notes: withNotes ? res.unplaced : [],
    };
    const n = onApply(chosen, files.length ? files.map((f) => f.name).join(', ') : 'Розповідь менеджера');
    setDone(n ? `Додано в бриф: ${n}. Перевірте поля й натисніть «Зберегти бриф».` : 'Нічого не вибрано.');
    setRes(null); setRows([]); setText(''); setFiles([]);
  }
  const quoteOf = (type, i) => {
    const pools = { fact: res.facts, product: res.products, offer: res.offers, goal: res.goals };
    const idx = rows.slice(0, i).filter((x) => x.type === type).length;
    return pools[type][idx];
  };
  const chosenCount = rows.filter((x) => x.mode !== 'skip').length;

  const hero = (
    <div className="wf-bd-hero">
      {head}
      <div className="wf-bd-hero-t"><h3>Розкажіть про клієнта своїми словами</h3><span>Система розставить факти по полях, ви лише перевірите</span></div>
      {!res && (
        <>
          <textarea className="wf-ta" style={{ marginTop: 10, minHeight: 90 }} aria-label="Розповідь про клієнта" placeholder="Наприклад: клієнт продає меблі з дуба, доставка по Україні й до Польщі, бюджет близько 4500 доларів на місяць, хочемо 60 покупок. Слова «дешевий» і «акція» не вживати." value={text} onChange={(e) => setText(e.target.value)} />
          <div className="wf-row" style={{ marginTop: 10 }}>
            <button type="button" className={'wf-btn sm' + (listening ? ' rec' : '')} aria-pressed={listening} onClick={dictate}>{listening ? '⏹ Слухаю… натисніть, щоб зупинити' : '🎙 Надиктувати'}</button>
            <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { setFiles((f) => [...f, ...e.target.files].slice(0, MAX_FILES)); e.target.value = ''; }} />
            <button type="button" className="wf-btn sm" onClick={() => fileRef.current?.click()}>📎 Прикріпити файл (PDF, Word, TXT)</button>
            {files.map((f, i) => <span key={f.name + i} className="wf-pill-x">{f.name}<button type="button" aria-label={`Прибрати «${f.name}»`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}>×</button></span>)}
            <span className="wf-row" style={{ marginLeft: 'auto' }}><button type="button" className="wf-btn main" disabled={busy || (text.trim().length < 8 && !files.length)} onClick={analyse}>{busy ? 'Розбираю…' : 'Розібрати і розставити'}</button></span>
          </div>
        </>
      )}
      {err && <div className="wf-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      {done && <div className="wf-bd-hero-ok" role="status">{done}</div>}
    </div>
  );
  return (
    <>
      {hero}
      {res && (
        <div className="wf-card wf-imp">
        <div style={{ marginTop: 12 }}>
          <div className="wf-h">Знайдено: {rows.length}. Позначте, що додати в бриф</div>
          {res.files.some((f) => f.read === 'pdf') && <div className="wf-muted" style={{ fontSize: 12.5, marginBottom: 6 }}>PDF читає модель: код не може звірити цитати з нього, тому такі пункти позначено «перевірте».</div>}
          {rows.length === 0 && <div className="wf-muted">Фактів для брифу не знайшов.</div>}
          {rows.map((x, i) => {
            const q = quoteOf(x.type, i);
            const label = x.type === 'fact' ? SPEC[x.key].label : x.type === 'product' ? 'Товар' : x.type === 'offer' ? 'Офер' : 'Ціль креатива';
            const long = x.type === 'fact' && SPEC[x.key].kind === 'long';
            return (
              <div key={i} className="wf-imp-row">
                <div style={{ minWidth: 0 }}>
                  <b>{label}</b>
                  {x.type === 'fact' && (long
                    ? <textarea className="wf-ta" style={{ minHeight: 48 }} aria-label={label} value={x.value} onChange={(e) => upd(i, { value: e.target.value })} />
                    : <input className="wf-bd-in" aria-label={label} value={x.value} onChange={(e) => upd(i, { value: e.target.value })} />)}
                  {x.type === 'product' && <div>{x.name}{x.price != null ? `: ${x.price}` : ''}{x.cogs != null ? `, собівартість ${x.cogs}` : ''}</div>}
                  {x.type === 'offer' && <div>{x.name}{x.pays != null ? `: клієнт платить ${x.pays}` : ''}</div>}
                  {x.type === 'goal' && <div>{x.goal}{x.product ? ` (товар: ${x.product})` : ''}</div>}
                  {q?.quote && <div className="wf-imp-q">«{q.quote}»</div>}
                  <div className="wf-bd-meta">
                    {q?.state === 'check' ? <span className="wf-st warn"><i />перевірте: {q.why}</span> : <span className="wf-st ok"><i />цитата є в тексті</span>}
                    {x.conflict && <span className="wf-st bad"><i />у брифі вже є: {x.conflict.slice(0, 80)}</span>}
                  </div>
                </div>
                <div className="wf-imp-mode"><Select ariaLabel={`Що зробити: ${label}`} value={x.mode} onChange={(v) => upd(i, { mode: v })} options={x.conflict
                  ? [{ value: 'skip', label: 'Залишити поточне' }, { value: 'set', label: 'Замінити' }, ...(long ? [{ value: 'append', label: 'Дописати' }] : [])]
                  : [{ value: 'set', label: 'Додати в бриф' }, { value: 'skip', label: 'Пропустити' }]} /></div>
              </div>
            );
          })}
          {res.dropped.length > 0 && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Код відкинув: {res.dropped.join('; ')}.</div>}
          {res.unplaced.length > 0 && <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Не вдалося розкласти: {res.unplaced.map((u) => `«${u}»`).join(' ')}</div>}
          <div className="wf-row" style={{ marginTop: 12 }}>
            <button type="button" className="wf-btn p" onClick={() => apply(false)}>Додати вибране ({chosenCount})</button>
            {res.unplaced.length > 0 && <button type="button" className="wf-btn" onClick={() => apply(true)}>Додати вибране і решту в нотатки</button>}
            <button type="button" className="wf-btn" onClick={() => { setRes(null); setRows([]); }}>Скасувати</button>
          </div>
        </div>
        </div>
      )}
    </>
  );
}
