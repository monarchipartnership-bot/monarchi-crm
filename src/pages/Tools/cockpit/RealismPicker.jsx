import { useEffect, useMemo, useState } from 'react';
import { LOOKS, LOOK_NEGATIVE, cleanLook } from '../../../lib/creatives/realism';
import { Spinner } from './parts';
import LookThumb from '../../../components/Projects/Teams/LookThumb';
import '../../../styles/realism.css';

// «Реалізм картинок» in the settings of a task (owner's pick A, step 3.4, 2026-11-13): the look of the pictures of THIS task. The creative maker writes the scene, the system adds the cues of the chosen look
// (lens, light, texture, the «living» imperfections) to every prompt for Higgsfield and a list of what makes a picture look generated.
//   look: the saved look of the task (a key or empty)   onSave(key | null): Promise
export default function RealismPicker({ look, onSave }) {
  const saved = cleanLook(look) || 'std';
  const [pick, setPick] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { setPick(saved); }, [saved]);
  const current = useMemo(() => LOOKS.find((l) => l.key === pick) || LOOKS[0], [pick]);
  const dirty = pick !== saved;

  async function save() {
    setBusy(true); setErr('');
    try { await onSave(pick === 'std' ? null : pick); } catch (e) { setErr(e?.message || 'Не вдалося зберегти.'); } finally { setBusy(false); }
  }
  return (
    <div className="rl">
      <div className="rl-head"><b>Реалізм картинок</b><span className={'ckp-chip' + (saved !== 'std' ? ' is-work' : '')}>{LOOKS.find((l) => l.key === saved)?.label}</span></div>
      <p className="sd-note">Як має виглядати зображення: освітлення, камера, фактура, «живі» недосконалості. Креативщик пише сцену, а система додає до кожного запиту в Higgsfield приписи вибраного вигляду. «Як зараз» нічого не додає. Діє на нові картинки цього завдання.</p>
      <div className="rl-grid" role="radiogroup" aria-label="Вигляд картинок">
        {LOOKS.map((l) => (
          <button key={l.key} type="button" role="radio" aria-checked={pick === l.key} className={'rl-card' + (pick === l.key ? ' is-on' : '')} onClick={() => setPick(l.key)}>
            <LookThumb look={l.key} className="rl-th" />
            <b>{l.label}</b>
            <small>{l.desc}</small>
          </button>
        ))}
      </div>
      {current.cues && (
        <details className="rl-more">
          <summary>Що саме додається до запиту</summary>
          <p><em>Підходить для:</em> {current.use}</p>
          <code>{current.cues}</code>
          <p><em>І до того, чого не має бути:</em></p>
          <code>{LOOK_NEGATIVE}</code>
        </details>
      )}
      {err && <p className="ckp-err" role="alert">{err}</p>}
      <div className="se-acts">
        <button type="button" className="ckp-btn is-primary" disabled={busy || !dirty} onClick={save}>{busy ? <Spinner /> : null}Зберегти для завдання</button>
        {dirty && <button type="button" className="ckp-btn" disabled={busy} onClick={() => setPick(saved)}>Скасувати</button>}
      </div>
    </div>
  );
}
