import { useEffect, useMemo, useState } from 'react';
import { agentAction } from '../../../lib/api/agents';
import { DEFAULT_MARGIN, composerOptions, draftFromStyle, effectiveStyle, manualFromDraft, mergeManual } from '../../../lib/agents/projectStyle';
import { TEXT_EDIT_LIMITS } from '../../../lib/creatives/textEdit';
import { Chips, INKS, PLATES, Preview, Slider, ZONES } from './StyleEditor';
import { Spinner } from './parts';
import DialogShell from './DialogShell';
import '../../../styles/textEdit.css';

const FIELDS = [['headline', 'Заголовок'], ['subline', 'Підзаголовок'], ['badge', 'Плашка'], ['cta', 'Кнопка']];
const nameOf = (list, k) => (list.find(([x]) => x === k) || [])[1] || '';

// «Редагувати текст» (owner's pick A, step 3.1e; the look of 2026-11-17, decision 55: the words first, the look folded into one line with «Змінити»): the words of a READY creative are changed here without
// making the picture again. The picture stays, the preview is drawn by the same code as the server, «Зберегти текст» puts the words on the same picture again (free). «Як було в ТЗ» takes the edit off.
//   item: { id, rawUrl, conceptName, ratio }   autoStyle: the scout's decision   taskStyle: the style of the task (manual)   onSave(edit | null): Promise   onClose()
export default function TextEditDialog({ item, autoStyle, taskStyle, onSave, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [f, setF] = useState({ headline: '', subline: '', badge: '', cta: '' });
  const [draft, setDraft] = useState(null);
  const [lookOpen, setLookOpen] = useState(false);

  // the words that are on the picture now and the edit made earlier
  useEffect(() => {
    let dead = false;
    agentAction('creative_text_info', { creativeId: item.id }).then((r) => {
      if (dead) return;
      if (!r?.ok) { setError('Не вдалося прочитати текст креатива.'); return; }
      setInfo(r);
      setF({ headline: r.fields?.headline || '', subline: r.fields?.subline || '', badge: r.fields?.badge || '', cta: r.fields?.cta || '' });
    }).catch((e) => { if (!dead) setError(e?.message || 'Не вдалося прочитати текст креатива.'); });
    return () => { dead = true; };
  }, [item.id]);

  // the style the words have now: the scout, the task, the earlier edit of this creative; the edit of THIS creative is what differs from the task
  const base = useMemo(() => effectiveStyle(autoStyle, taskStyle).value.text, [autoStyle, taskStyle]);
  useEffect(() => { if (info) setDraft(draftFromStyle(base, effectiveStyle(autoStyle, mergeManual(taskStyle, info.edit?.style)).value.text)); }, [info]); // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (info ? { headline: info.fields?.headline || '', subline: info.fields?.subline || '', badge: info.fields?.badge || '', cta: info.fields?.cta || '' } : null), [info]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const styleText = useMemo(() => (draft ? { zone: draft.zone, size: draft.size, plate: draft.plate, color: draft.color, margin: draft.margin, ...(draft.plate === 'on' ? { plate_strength: draft.strength } : {}) } : null), [draft]);
  const styleDiff = useMemo(() => (draft ? manualFromDraft(draft, base) : {}), [draft, base]);
  // the edit that is saved: what was edited earlier, with what changed now over it
  const nextEdit = useMemo(() => {
    if (!info || !draft) return null;
    const out = { ...(info.edit || {}) };
    delete out.style;
    FIELDS.forEach(([k]) => { if (f[k] !== initial[k]) out[k] = f[k]; });
    if (Object.keys(styleDiff).length) out.style = { text: styleDiff };
    return Object.keys(out).length ? out : null;
  }, [info, draft, f, initial, styleDiff]);
  const dirty = !!info && JSON.stringify(nextEdit) !== JSON.stringify(info.edit || null);
  const sample = useMemo(() => ({ url: item.rawUrl, exact: true, headline: f.headline, subline: f.subline, badge: f.badge, cta: f.cta }), [item.rawUrl, f]);
  const canSave = !!info && !busy && dirty && !!f.headline.trim();

  async function save(edit) {
    setBusy(edit ? 'save' : 'reset'); setError('');
    try { await onSave(edit); onClose(); } catch (e) { setError(e?.message || 'Не вдалося зберегти текст.'); setBusy(''); }
  }
  const ready = info && draft;
  return (
    <DialogShell wide title={`Текст на креативі «${item.conceptName}»`} sub={`${item.ratio || '4:5'} · картинка та сама, $0`} label={`Текст на креативі ${item.conceptName}`} busy={!!busy} onClose={onClose}
      onSubmit={() => { if (canSave) save(nextEdit); }} escGuard={() => !!document.querySelector('.ui-select-menu:not(.closing)')}
      left={ready ? (
        <>
          <Preview sample={sample} text={styleText} zone={info.fields?.zone || 'top'} />
          {!info.hasPicture && <p className="ckp-err">У креатива ще немає картинки.</p>}
          <small>Так текст ляже на ту саму картинку. Малюється тим самим кодом, що й на сервері.</small>
        </>
      ) : null}
      footer={ready ? (
        <>
          <button type="button" className="ckp-btn rtd-link" disabled={!!busy || !info.edit} onClick={() => save(null)}>{busy === 'reset' ? <Spinner /> : null}Як було в ТЗ</button>
          <button type="button" className="ckp-btn" disabled={!!busy} onClick={onClose}>Скасувати</button>
          <button type="button" className="ckp-btn is-primary" disabled={!canSave} onClick={() => save(nextEdit)}>{busy === 'save' ? <Spinner /> : null}Зберегти текст · $0</button>
        </>
      ) : <button type="button" className="ckp-btn" onClick={onClose}>Закрити</button>}>
      {!info && !error && <p className="ckp-empty-line" role="status">Завантажуємо текст…</p>}
      {error && <p className="ckp-err" role="alert">{error}</p>}
      {ready && (
        <>
          <div className="rtd-sec">
            <h5>Слова</h5>
            {FIELDS.map(([k, label]) => (
              <label key={k} className="rtd-fld">
                <span className="rtd-lab is-row">{label}<b>{f[k].length}/{TEXT_EDIT_LIMITS[k]}</b></span>
                <input type="text" className="rtd-in" maxLength={TEXT_EDIT_LIMITS[k]} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={k === 'headline' ? 'Заголовок' : k === 'cta' ? 'Порожньо: без кнопки' : 'Необовʼязково'} aria-label={label} />
              </label>
            ))}
          </div>
          <div className="rtd-sec">
            <h5>Вигляд <button type="button" className="rtd-sbtn" aria-expanded={lookOpen} onClick={() => setLookOpen((v) => !v)}>{lookOpen ? 'Згорнути' : 'Змінити'}</button></h5>
            {!lookOpen && <span className="rtd-sum">Місце: {nameOf(ZONES, draft.zone)} · розмір {draft.size === 'auto' ? 'стандартний' : `${draft.size}%`} · підкладка: {nameOf(PLATES, draft.plate)} · колір: {nameOf(INKS, draft.color)}</span>}
            {lookOpen && (
              <>
                <Chips label="Місце тексту" value={draft.zone} options={ZONES} onPick={(zone) => set({ zone })} />
                <Slider label="Розмір" value={typeof draft.size === 'number' ? draft.size : 100} auto={draft.size === 'auto'} min={60} max={140} step={5} fallback={100} autoLabel="стандартний" onChange={(size) => set({ size })} onAuto={() => set({ size: draft.size === 'auto' ? 100 : 'auto' })} />
                <Chips label="Підкладка" value={draft.plate} options={PLATES} onPick={(plate) => set({ plate })} />
                {draft.plate === 'on' && <Slider label="Сила підкладки" value={draft.strength} auto={false} min={10} max={90} step={5} fallback={55} onChange={(strength) => set({ strength })} onAuto={() => set({ strength: 55 })} />}
                <Chips label="Колір тексту" value={draft.color} options={INKS} onPick={(color) => set({ color })} />
                <Slider label="Відступ від краю" value={typeof draft.margin === 'number' ? draft.margin : DEFAULT_MARGIN} auto={draft.margin === 'auto'} min={3} max={15} step={1} fallback={DEFAULT_MARGIN} autoLabel="за замовчуванням" onChange={(margin) => set({ margin })} onAuto={() => set({ margin: draft.margin === 'auto' ? DEFAULT_MARGIN : 'auto' })} />
              </>
            )}
          </div>
          <small className="rtd-sum">Зберегти: сервер малює текст заново на тій самій картинці, це безкоштовно. «Як було в ТЗ» повертає текст і вигляд, які склали агенти й налаштування завдання.</small>
        </>
      )}
    </DialogShell>
  );
}
