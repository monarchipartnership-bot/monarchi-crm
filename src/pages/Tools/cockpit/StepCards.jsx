import { useState } from 'react';
import { buildStepCards } from '../../../lib/agents/stageDetails';
import { fetchStepDetail } from '../../../lib/api/projectCockpit';
import '../../../styles/stepDetails.css';

const CHIP = { ok: 'is-ok', work: 'is-work', bad: 'is-bad', grey: '' };
const INPUT_LIMIT = 6000;
const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} о ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// The blocks of the agents under the scheme of a task (owner, 2026-11-12): what each agent does, what it made and passed on, why it waits; the full text, what it was given
// and the log of its runs open on a click and are read only then.
//   stages: the stages of the task (cockpit request .stages)   paused: the operation is stopped
export default function StepCards({ stages = [], paused = false }) {
  const cards = buildStepCards({ stages, paused });
  const [open, setOpen] = useState({}); // key -> { loading, error, data }
  async function toggle(card) {
    if (open[card.key]) { setOpen((o) => { const n = { ...o }; delete n[card.key]; return n; }); return; }
    setOpen((o) => ({ ...o, [card.key]: { loading: true } }));
    try { const data = await fetchStepDetail(card.taskId); setOpen((o) => (o[card.key] ? { ...o, [card.key]: { data } } : o)); } catch (e) { setOpen((o) => (o[card.key] ? { ...o, [card.key]: { error: e?.message || 'Не вдалося прочитати.' } } : o)); }
  }
  if (!cards.length) return null;
  return (
    <section className="sd" aria-label="Що роблять агенти">
      <h4 className="sd-title">Агенти завдання</h4>
      <ul className="sd-list">
        {cards.map((c) => {
          const o = open[c.key];
          const meta = [c.finishedAt && c.state === 'done' ? `готово ${hhmm(c.finishedAt)}` : '', c.duration, c.costUsd ? `$${c.costUsd.toFixed(3)}` : ''].filter(Boolean).join(' · ');
          return (
            <li key={c.key} className={'sd-card is-' + c.tone}>
              <div className="sd-head"><b>{c.label}</b><span className={'ckp-chip ' + (CHIP[c.tone] || '')}>{c.stateLabel}</span>{meta && <small>{meta}</small>}</div>
              <dl className="sd-rows">
                <div><dt>Над чим</dt><dd>{c.work}</dd></div>
                {c.result && <div><dt>Результат</dt><dd>{c.result}</dd></div>}
                {c.why && <div><dt>{c.state === 'failed' ? 'Помилка' : 'Статус'}</dt><dd>{c.why}</dd></div>}
                {c.passed && <div><dt>Далі</dt><dd>{c.passed}</dd></div>}
              </dl>
              {c.taskId != null && ['done', 'failed'].includes(c.state) && (
                <button type="button" className="sd-more" aria-expanded={!!o} onClick={() => toggle(c)}>{o ? 'Сховати подробиці' : 'Показати повністю'}</button>
              )}
              {o?.loading && <p className="sd-note" role="status">Читаємо…</p>}
              {o?.error && <p className="sd-note is-bad" role="alert">{o.error}</p>}
              {o?.data && (
                <div className="sd-detail">
                  {o.data.error && <p className="sd-note is-bad">{o.data.error}</p>}
                  <h5>Повний результат</h5>
                  {o.data.text ? <pre className="sd-pre">{o.data.text}</pre> : <p className="sd-note">Текст результату відсутній.</p>}
                  {o.data.runs[0]?.input && (
                    <details className="sd-input"><summary>Що отримав агент</summary><pre className="sd-pre">{o.data.runs[0].input.slice(0, INPUT_LIMIT)}{o.data.runs[0].input.length > INPUT_LIMIT ? '\n…' : ''}</pre></details>
                  )}
                  {o.data.runs.length > 0 && (
                    <>
                      <h5>Журнал запусків</h5>
                      <ul className="sd-log">{o.data.runs.map((r, i) => <li key={i}>{[hhmm(r.createdAt), r.status === 'ok' ? 'успішно' : r.status, r.model, r.durationMs ? `${Math.round(r.durationMs / 1000)} с` : '', `токени: ${r.inputTokens} → ${r.outputTokens}`, r.costUsd ? `$${r.costUsd.toFixed(3)}` : '', r.error].filter(Boolean).join(' · ')}</li>)}</ul>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
