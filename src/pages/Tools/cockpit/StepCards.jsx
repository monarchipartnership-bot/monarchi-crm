import { useState } from 'react';
import useSpeechInput, { SPEECH_LANGS } from '../../../lib/useSpeechInput';
import { reviseStep } from '../../../lib/api/campaignControl';
import { buildStepCards } from '../../../lib/agents/stageDetails';
import { fetchStepDetail } from '../../../lib/api/projectCockpit';
import '../../../styles/stepDetails.css';

const CHIP = { ok: 'is-ok', work: 'is-work', bad: 'is-bad', grey: '' };
const INPUT_LIMIT = 6000;
const hhmm = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} о ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// The blocks of the agents under the scheme of a task (owner, 2026-11-12): what each agent does, what it made and passed on, why it waits; the full text, what it was given
// and the log of its runs open on a click and are read only then.
//   stages: the stages of the task (cockpit request .stages)   paused: the operation is stopped   onRevised(): a correction was sent, the cabinet is read again
export default function StepCards({ stages = [], paused = false, onRevised }) {
  const cards = buildStepCards({ stages, paused });
  const [open, setOpen] = useState({}); // key -> { loading, error, data }
  // «Виправити з коментарем»: the manager says in words (typed or dictated) what to change; the agent makes the step again and the agents below follow
  const [rev, setRev] = useState(null); // { key, text, busy, error }
  const [voiceLang, setVoiceLang] = useState('uk');
  const speech = useSpeechInput({ lang: voiceLang, onText: (txt) => { if (txt) setRev((r) => (r ? { ...r, text: `${r.text}${r.text && !/\s$/.test(r.text) ? ' ' : ''}${txt}`.slice(0, 2000) } : r)); } });
  async function sendRevision(card) {
    setRev((r) => ({ ...r, busy: true, error: '' }));
    try { await reviseStep(card.taskId, rev.text); setRev(null); onRevised?.(); } catch (e) { setRev((r) => ({ ...r, busy: false, error: e?.message || 'Не вдалося надіслати правку.' })); }
  }
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
              <div className="sd-acts">
                {c.taskId != null && ['done', 'failed'].includes(c.state) && (
                  <button type="button" className="sd-more" aria-expanded={!!o} onClick={() => toggle(c)}>{o ? 'Сховати подробиці' : 'Показати повністю'}</button>
                )}
                {c.canRevise && rev?.key !== c.key && <button type="button" className="sd-more" onClick={() => setRev({ key: c.key, text: '', busy: false, error: '' })}>Виправити з коментарем</button>}
              </div>
              {rev?.key === c.key && (
                <div className="sd-rev">
                  <label htmlFor={`sd-rev-${c.key}`}>Що виправити в результаті «{c.label}»</label>
                  <textarea id={`sd-rev-${c.key}`} rows={3} maxLength={2000} value={rev.text} onChange={(e) => setRev((r) => ({ ...r, text: e.target.value }))} placeholder="Напишіть або надиктуйте: наприклад, прибери напрям 2 і додай акцент на безкоштовну доставку" autoFocus />
                  {speech.listening && <p className="sd-note" role="status">Слухаю… {speech.interim}</p>}
                  {speech.error && <p className="sd-note is-bad" role="alert">{speech.error}</p>}
                  <p className="sd-note">Агент переробить цей крок за вашим коментарем, а наступні кроки відпрацюють заново (приблизно $0.03 за кожен). Працює, поки картинки ще не генерувались.</p>
                  {rev.error && <p className="sd-note is-bad" role="alert">{rev.error}</p>}
                  <div className="sd-revbar">
                    <button type="button" className="ckp-btn is-primary" disabled={rev.busy || rev.text.trim().length < 3} onClick={() => sendRevision(c)}>{rev.busy ? 'Надсилаємо…' : 'Переробити крок'}</button>
                    <button type="button" className="ckp-btn" disabled={rev.busy} onClick={() => { speech.stop(); setRev(null); }}>Скасувати</button>
                    {speech.supported && (<>
                      <select className="sd-lang" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)} disabled={speech.listening} aria-label="Мова, якою ви говорите">{SPEECH_LANGS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
                      <button type="button" className={'ckp-btn' + (speech.listening ? ' is-primary' : '')} aria-pressed={speech.listening} onClick={speech.toggle}>{speech.listening ? 'Зупинити запис' : 'Голос'}</button>
                    </>)}
                  </div>
                </div>
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
