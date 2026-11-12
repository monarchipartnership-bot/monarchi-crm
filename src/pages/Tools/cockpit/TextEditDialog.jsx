import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { agentAction } from '../../../lib/api/agents';
import { DEFAULT_MARGIN, composerOptions, draftFromStyle, effectiveStyle, manualFromDraft, mergeManual } from '../../../lib/agents/projectStyle';
import { TEXT_EDIT_LIMITS } from '../../../lib/creatives/textEdit';
import { Chips, INKS, PLATES, Preview, Slider, ZONES } from './StyleEditor';
import { Ic, Spinner } from './parts';
import '../../../styles/textEdit.css';

const FIELDS = [['headline', 'Заголовок'], ['subline', 'Підзаголовок'], ['badge', 'Плашка'], ['cta', 'Кнопка']];

// «Редагувати текст» (owner's pick A, step 3.1e): the words of a READY creative are changed here without making the picture again. The picture stays, the preview is drawn by the same code as the
// server, «Зберегти текст» puts the words on the same picture again (free). «Як було в ТЗ» takes the edit off.
//   item: { id, rawUrl, conceptName, ratio }   autoStyle: the scout's decision   taskStyle: the style of the task (manual)   onSave(edit | null): Promise   onClose()
export default function TextEditDialog({ item, autoStyle, taskStyle, onSave, onClose }) {
  const box = useRef(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [f, setF] = useState({ headline: '', subline: '', badge: '', cta: '' });
  const [draft, setDraft] = useState(null);

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

  useEffect(() => {
    box.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy && !document.querySelector('.ui-select-menu:not(.closing)')) { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose, busy]);

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

  async function save(edit) {
    setBusy(edit ? 'save' : 'reset'); setError('');
    try { await onSave(edit); onClose(); } catch (e) { setError(e?.message || 'Не вдалося зберегти текст.'); setBusy(''); }
  }

  return createPortal(
    <div className="ckp ckp-overlay is-night ai-immersive ted-ov" data-ai-safe onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="ted-win" role="dialog" aria-modal="true" aria-label={`Текст на креативі ${item.conceptName}`} tabIndex={-1}>
        <header className="ted-head">
          <div><h2>Текст на креативі «{item.conceptName}»</h2><small>{item.ratio || '4:5'} · картинка та сама, $0</small></div>
          <button type="button" className="ckp-x ckp-x-lg" onClick={onClose} disabled={!!busy} aria-label="Закрити"><Ic n="close" size={17} /></button>
        </header>
        {!info && !error && <p className="ckp-empty-line" role="status">Завантажуємо текст…</p>}
        {error && <p className="ckp-err" role="alert">{error}</p>}
        {info && draft && (
          <div className="ted-grid">
            <div className="ted-left">
              <Preview sample={sample} text={styleText} zone={info.fields?.zone || 'top'} />
              {!info.hasPicture && <p className="ckp-err">У креатива ще немає картинки.</p>}
            </div>
            <div className="ted-ctl">
              {FIELDS.map(([k, label]) => (
                <label key={k} className="se-row ted-f">
                  <span className="se-lab">{label}<b>{f[k].length}/{TEXT_EDIT_LIMITS[k]}</b></span>
                  <input type="text" maxLength={TEXT_EDIT_LIMITS[k]} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={k === 'headline' ? 'Заголовок' : k === 'cta' ? 'Порожньо: без кнопки' : 'Необовʼязково'} aria-label={label} />
                </label>
              ))}
              <Chips label="Місце тексту" value={draft.zone} options={ZONES} onPick={(zone) => set({ zone })} />
              <Slider label="Розмір" value={typeof draft.size === 'number' ? draft.size : 100} auto={draft.size === 'auto'} min={60} max={140} step={5} fallback={100} autoLabel="стандартний" onChange={(size) => set({ size })} onAuto={() => set({ size: draft.size === 'auto' ? 100 : 'auto' })} />
              <Chips label="Підкладка" value={draft.plate} options={PLATES} onPick={(plate) => set({ plate })} />
              {draft.plate === 'on' && <Slider label="Сила підкладки" value={draft.strength} auto={false} min={10} max={90} step={5} fallback={55} onChange={(strength) => set({ strength })} onAuto={() => set({ strength: 55 })} />}
              <Chips label="Колір тексту" value={draft.color} options={INKS} onPick={(color) => set({ color })} />
              <Slider label="Відступ від краю" value={typeof draft.margin === 'number' ? draft.margin : DEFAULT_MARGIN} auto={draft.margin === 'auto'} min={3} max={15} step={1} fallback={DEFAULT_MARGIN} autoLabel="за замовчуванням" onChange={(margin) => set({ margin })} onAuto={() => set({ margin: draft.margin === 'auto' ? DEFAULT_MARGIN : 'auto' })} />
              <div className="se-acts">
                <button type="button" className="ckp-btn is-primary" disabled={!!busy || !dirty || !f.headline.trim()} onClick={() => save(nextEdit)}>{busy === 'save' ? <Spinner /> : null}Зберегти текст</button>
                <button type="button" className="ckp-btn" disabled={!!busy} onClick={onClose}>Скасувати</button>
                <button type="button" className="ckp-btn" disabled={!!busy || !info.edit} onClick={() => save(null)}>{busy === 'reset' ? <Spinner /> : null}Як було в ТЗ</button>
              </div>
              <small className="sd-note">Зберегти: сервер малює текст заново на тій самій картинці, це безкоштовно. «Як було в ТЗ» повертає текст і вигляд, які склали агенти й налаштування завдання.</small>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
