import { useState } from 'react';
import '../../../styles/stepDetails.css';

const hhmm = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? time : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${time}`;
};
const DOT = { running: 'is-run', done: 'is-ok', failed: 'is-bad', info: '' };

// «Хід роботи» (owner, 2026-11-12, variant A): what the agents do, one line per real event, as it happens (the cabinet is read every few seconds while something works).
//   steps: cockpit request .steps (newest first)   working: something works now (the «наживо» mark)   limit: how many lines before «Показати все»   title: the heading
export default function LiveSteps({ steps = [], working = false, limit = 8, title = 'Хід роботи' }) {
  const [all, setAll] = useState(false);
  if (!steps.length) return null;
  const shown = all ? steps : steps.slice(0, limit);
  return (
    <section className="sd-live" aria-label={title}>
      <h4 className="sd-title">{title}{working && <span className="sd-pulse" role="status">наживо</span>}</h4>
      <ol className="sd-feed" aria-live="polite">
        {shown.map((x) => (
          <li key={x.id} className={'sd-line ' + (DOT[x.state] || '')}>
            <time dateTime={x.at}>{hhmm(x.at)}</time>
            <i className="sd-dot" aria-hidden="true" />
            {x.label && <em>{x.label}</em>}
            <span>{x.text}</span>
          </li>
        ))}
      </ol>
      {steps.length > limit && <button type="button" className="sd-more" onClick={() => setAll((v) => !v)}>{all ? 'Сховати старі кроки' : `Показати все (${steps.length})`}</button>}
    </section>
  );
}
