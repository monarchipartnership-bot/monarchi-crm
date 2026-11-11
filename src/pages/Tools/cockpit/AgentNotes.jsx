import { useState } from 'react';
import '../../../styles/stepDetails.css';

// «Агенти уточнюють» (owner, 2026-11-12): what the agents were unsure about, merged into short entries. It is information, not a task: each entry says what it is, who asks and
// gives a way out: fill the field in the card, answer in a few words (the agents read it as the manager's instruction in the next runs) or say it does not matter.
//   notes: lib/agents/agentNotes.mergeNotes   onDismiss(note)   onAnswer(note, text) → Promise   onGoFill(section) (optional)
export default function AgentNotes({ notes = [], onDismiss, onAnswer, onGoFill }) {
  const [answer, setAnswer] = useState(null); // { id, text, busy, error }
  if (!notes.length) return null;
  async function send(n) {
    setAnswer((a) => ({ ...a, busy: true, error: '' }));
    try { await onAnswer(n, answer.text); setAnswer(null); } catch (e) { setAnswer((a) => ({ ...a, busy: false, error: e?.message || 'Не вдалося надіслати.' })); }
  }
  return (
    <section className="sd-notes" aria-label="Агенти уточнюють">
      <h4 className="sd-title">Агенти уточнюють <span className="sd-count">{notes.length}</span></h4>
      <p className="sd-note">Це не завдання для вас, а підказки, що покращать наступні роботи. Завдання вже виконується.</p>
      <ul className="sd-list">
        {notes.map((n) => (
          <li key={n.id} className="sd-card sd-nitem">
            <div className="sd-head"><span className="ckp-chip">{n.label}</span><small>уточнюють: {n.agents.join(', ')}</small></div>
            <p className="sd-ntext">{n.text}</p>
            {answer?.id === n.id ? (
              <div className="sd-rev">
                <label htmlFor={`sd-ans-${n.id}`}>Ваша відповідь агентам</label>
                <textarea id={`sd-ans-${n.id}`} rows={2} maxLength={600} value={answer.text} onChange={(e) => setAnswer((a) => ({ ...a, text: e.target.value }))} placeholder="Коротко: наприклад, текст на кнопці CTA не потрібен, лише графічний елемент" autoFocus />
                <p className="sd-note">Агенти прочитають це як вашу вказівку й врахують у наступних завданнях. Поточне завдання виправляється кнопкою «Виправити з коментарем» у блоці агента.</p>
                {answer.error && <p className="sd-note is-bad" role="alert">{answer.error}</p>}
                <div className="sd-revbar">
                  <button type="button" className="ckp-btn is-primary" disabled={answer.busy || answer.text.trim().length < 3} onClick={() => send(n)}>{answer.busy ? 'Надсилаємо…' : 'Передати агентам'}</button>
                  <button type="button" className="ckp-btn" disabled={answer.busy} onClick={() => setAnswer(null)}>Скасувати</button>
                </div>
              </div>
            ) : (
              <div className="sd-nacts">
                {n.fill && onGoFill && <button type="button" className="ckp-btn is-primary" onClick={() => onGoFill(n.fill)}>{n.fillLabel}</button>}
                <button type="button" className="ckp-btn" onClick={() => setAnswer({ id: n.id, text: '', busy: false, error: '' })}>Відповісти</button>
                <button type="button" className="ckp-btn" onClick={() => onDismiss(n)}>Неважливо</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
