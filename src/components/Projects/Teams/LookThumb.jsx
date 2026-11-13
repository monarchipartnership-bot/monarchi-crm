import { useState } from 'react';
import { LOOKS, LOOK_EXAMPLES } from '../../../lib/creatives/realism';
import '../../../styles/taskExtras.css';

// The example picture of a realism look (owner, 2026-11-13: «сразу с примерами изображения, чтобы было визуально понятно в чем отличие»): the SAME scene (a nail polish bottle) made in each look,
// kept in /public/realism/<key>.jpg. A look without an example (or one that fails to load) shows its colour swatch.
export default function LookThumb({ look, className = '' }) {
  const [failed, setFailed] = useState(false);
  const def = LOOKS.find((l) => l.key === look) || LOOKS[0];
  const has = LOOK_EXAMPLES.includes(look) && !failed;
  return (
    <span className={'lkt ' + className} style={{ background: `linear-gradient(135deg, ${def.color}, #ffffff66)` }} aria-hidden="true">
      {has && <img src={`/realism/${look}.jpg`} alt="" loading="lazy" onError={() => setFailed(true)} />}
      {!has && <em>{look === 'std' ? 'без додавань' : look === 'auto' ? 'за ідеєю' : 'приклад скоро'}</em>}
    </span>
  );
}
