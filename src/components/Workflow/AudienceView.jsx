import { useState } from 'react';
import { Pill } from './parts';
import { SEGMENT_STATUS, SOURCE_NAME } from '../../lib/workflow/sections';

const FIELDS = [['who', 'Хто'], ['situation', 'Що відбувається'], ['wants', 'Чого хочуть'], ['pains', 'Болі'], ['blockers', 'Що зупиняє'], ['convincers', 'Що переконує'], ['message', 'Що кажемо в рекламі'], ['formats', 'Формати'], ['products', 'Товари'], ['targeting', 'Таргетинг']];

// The section «Аудиторія» (step A4, variant B of the mockup): the sources and the questions on top, the segments as a list on the left, the chosen one on the right.
export default function AudienceView({ content }) {
  const segs = content.segments || [];
  const [i, setI] = useState(0);
  const s = segs[Math.min(i, segs.length - 1)];
  const status = (x) => SEGMENT_STATUS[x?.status] || SEGMENT_STATUS.hypothesis;
  return (
    <div className="wf-col">
      <div className="wf-card" style={{ background: 'var(--wf-bg)' }}>
        <h3>Джерела</h3>
        <div className="wf-row">
          {(content.sources?.used || []).map((t) => <Pill key={t} tone="ok">{t}</Pill>)}
          {(content.sources?.skipped || []).map((t) => <Pill key={t} tone="mute">{t}</Pill>)}
        </div>
      </div>
      {content.questions?.length > 0 && (
        <div className="wf-card" style={{ background: 'var(--wf-info-bg)', boxShadow: 'none' }}>
          <h3>Питання до клієнта (опис аудиторії в брифі загальний)</h3>
          <ol className="wf-nlist">{content.questions.map((q, k) => <li key={k}>{q}</li>)}</ol>
          <div className="wf-muted" style={{ fontSize: 12.5, marginTop: 6 }}>Створено задачу менеджеру: «Уточнити в клієнта опис аудиторії».</div>
        </div>
      )}
      {!s ? <div className="wf-empty">Сегментів немає.</div> : (
        <div className="wf-grid wf-g2seg">
          <div className="wf-col" role="tablist" aria-label="Сегменти" aria-orientation="vertical">
            {segs.map((x, k) => (
              <button key={k} type="button" role="tab" aria-selected={s === x} className={'wf-seg' + (s === x ? ' on' : '')} onClick={() => setI(k)}>
                <span className="wf-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><b>{x.name}</b><Pill tone={status(x)[0]}>{status(x)[1]}</Pill></span>
                <span className="wf-muted">{x.who}</span>
              </button>
            ))}
          </div>
          <div className="wf-card">
            <div className="wf-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>{s.name}</h2><Pill tone={status(s)[0]}>{status(s)[1]}</Pill></div>
            <dl className="wf-kv">
              {FIELDS.map(([k, label]) => s[k] ? <div key={k} style={{ display: 'contents' }}><dt>{label}</dt><dd>{s[k]}</dd></div> : null)}
              <dt>Чим підтверджено</dt>
              <dd>{s.confirmed_by?.length ? s.confirmed_by.map((c) => `${SOURCE_NAME[c.source] || c.source} «${c.ref}»`).join('; ') : 'Підтвердження в даних немає: лишається гіпотезою.'}{s.problem ? ` Увага: ${s.problem}.` : ''}</dd>
            </dl>
            {s.angles?.length > 0 && <div className="wf-row" style={{ marginTop: 10 }}>{s.angles.map((a, k) => <span key={k} className="wf-chip">Кут: {a}</span>)}</div>}
          </div>
        </div>
      )}
      {content.open?.length > 0 && <div className="wf-muted" style={{ fontSize: 12.5 }}>Відкриті питання: {content.open.join(' ')}</div>}
    </div>
  );
}
