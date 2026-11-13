import { useState } from 'react';
import { Spinner } from './parts';
import '../../../styles/holdCard.css';

// The question of an agent to the manager (step 3.7, owner 2026-11-13): the task STANDS until the answer. The same agent works again with the answer; «Продовжити без відповіді» takes its result as it is.
//   question: { taskId, label, text, round }   busy: 'answer' | 'proceed' | ''   onAnswer(text)   onProceed()
export default function QuestionCard({ question, busy = '', onAnswer, onProceed }) {
  const [text, setText] = useState('');
  const lines = String(question.text || '').split(/\n| \/ /).map((x) => x.trim()).filter(Boolean);
  return (
    <section className="qst" aria-label="Питання агента">
      <h4><span className="qst-mark" aria-hidden="true">?</span>{question.label} питає вас{question.round > 1 ? ` (уточнення ${question.round})` : ''}</h4>
      <p className="qst-lead">Завдання стоїть: агент не передає роботу далі, поки ви не відповісте. Гроші на картинки не витрачаються.</p>
      <ul className="qst-list">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <label className="qst-field">
        <span>Ваша відповідь</span>
        <textarea rows={3} maxLength={1500} value={text} placeholder="Напишіть, що мав на увазі: агент прочитає це й зробить свій крок знову." onChange={(e) => setText(e.target.value)} aria-label="Ваша відповідь агенту" />
      </label>
      <div className="qst-acts">
        <button type="button" className="ckp-btn is-primary" disabled={!!busy || text.trim().length < 2} onClick={() => onAnswer(text.trim())}>{busy === 'answer' && <Spinner />}Відповісти й продовжити</button>
        <button type="button" className="ckp-btn" disabled={!!busy} onClick={onProceed}>{busy === 'proceed' && <Spinner />}Продовжити без відповіді</button>
      </div>
    </section>
  );
}
