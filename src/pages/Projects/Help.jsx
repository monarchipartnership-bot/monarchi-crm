import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HELP_CONTROLS, HELP_STAGES } from '../../lib/workflow/helpContent';
import { Pill } from '../../components/Workflow/parts';

// «Як це працює» (step A14, concept A «Карта процесу»): six stages in a row; a click opens what happens, who works, what you do, what you see and what can go wrong.
export default function Help() {
  const nav = useNavigate();
  const [sel, setSel] = useState(0);
  const refs = useRef([]);
  const s = HELP_STAGES[sel];
  // the stages are a row of toggle buttons: the arrows move between them (the usual keys of a row of choices)
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = (sel + step + HELP_STAGES.length) % HELP_STAGES.length;
    setSel(next); refs.current[next]?.focus();
  };
  return (
    <div className="wf wf-page wf-grid wf-help">
      <div className="wf-help-why"><b>Як читати.</b> Довідка йде за життям проєкту: пройдіть шість етапів зліва направо, і вся система стане зрозумілою. Натисніть на етап, щоб побачити, що на ньому відбувається і що робити вам.</div>
      <div className="wf-help-track" role="group" aria-label="Етапи процесу" onKeyDown={onKey}>
        {HELP_STAGES.map((x, i) => (
          <button key={x.n} ref={(el) => { refs.current[i] = el; }} type="button" className="wf-help-stage" aria-pressed={sel === i} onClick={() => setSel(i)}>
            <span className="n">{i + 1}</span><b>{x.title}</b><span className="h">{x.hint}</span>
          </button>
        ))}
      </div>
      <div className="wf-card" aria-live="polite">
        <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 className="wf-help-h">{sel + 1}. {s.title}</h2>
          <Pill tone="info">Працює: {s.who}</Pill>
        </div>
        <p style={{ margin: '0 0 12px' }}>{s.what}</p>
        <div className="wf-help-detail">
          <div className="wf-help-blk"><h4>Що робите ви</h4><p>{s.you}</p></div>
          <div className="wf-help-blk"><h4>Що побачите</h4><p>{s.see}</p></div>
          <div className="wf-help-blk"><h4>Якщо щось не так</h4><p>{s.wrong}</p></div>
        </div>
        <div className="wf-help-tip"><b>Підказка.</b> {s.tip}</div>
        <div className="wf-row" style={{ marginTop: 12 }}>
          <button type="button" className="wf-btn p" onClick={() => nav(s.go.to)}>{s.go.label}</button>
        </div>
      </div>
      <div className="wf-card">
        <h3>Завжди під рукою</h3>
        <div className="wf-help-detail">
          {HELP_CONTROLS.map((c) => (
            <div key={c.title} className="wf-help-blk"><h4>{c.title}</h4><p>{c.text}</p><p className="wf-muted" style={{ marginTop: 6, fontSize: 12.5 }}>Де: {c.where}</p></div>
          ))}
        </div>
      </div>
    </div>
  );
}
