import { useRef, useState } from 'react';
import useDialogA11y from '../../../lib/useDialogA11y';
import { createExtraCycle } from '../../../lib/api/operationCycles';
import { kickQueue } from '../../../lib/api/agents';
import { DEFAULT_CONCEPTS } from '../../../lib/agents/creativeTeam';
import TaskBrief, { clearTaskDraft } from './TaskBrief';

// A one-off task of creatives in the Hub style (owner, 2026-11-12): the same window look as the launch of a team instead of the old dark form of the AI section. The same
// fields as the regular task of the team (TaskBrief); everything about the client the agents take from the card of the project.
//   data: fetchTeamsData result   campaign: the operation of the creative team   onClose()   onCreated(text)
export default function OneOffCreativeDialog({ data, campaign, email, onClose, onCreated }) {
  const box = useRef(null);
  const paused = campaign.status === 'paused';
  const draftKey = `tm-oneoff-draft-${data.project.id}`;
  const [v, setV] = useState({ goal: '', count: String(DEFAULT_CONCEPTS), ratios: ['1:1'], texts: 'yes', language: data.project.client_language || 'uk' });
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useDialogA11y(box, () => { if (!busy) onClose(); });

  async function create() {
    setBusy(true); setError('');
    try {
      const row = await createExtraCycle(campaign.id, { goal: v.goal, count: Number(v.count), ratios: v.ratios, texts: v.texts, language: v.language, title: title.trim() }, email, !paused);
      if (!paused) kickQueue().catch(() => {});
      clearTaskDraft(draftKey);
      onCreated?.(paused ? 'Завдання збережено чернеткою: команда на паузі. Продовжте команду й запустіть його в картці команди.' : `Завдання №${row.id} створено й запущено: агенти працюють.`);
    } catch (e) { setError(e?.message || 'Не вдалося створити завдання.'); setBusy(false); }
  }

  return (
    <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="oc-title" tabIndex={-1}>
        <header className="tm-head"><h2 id="oc-title">Разове завдання: креативи</h2><button type="button" className="tm-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button></header>
        <div className="tm-body">
          <p className="tm-lead">Окреме завдання для команди «Креативи»: воно виконується один раз, незалежно від регулярного. Усе про клієнта агенти беруть із картки проєкту.</p>
          {error && <p className="pcr-error" role="alert">{error}</p>}
          {paused && <p className="tm-hint">Команда «Креативи» зараз на паузі: завдання збережеться чернеткою й запуститься, коли ви продовжите команду й запустите його.</p>}
          <label className="tm-fl"><span>Назва завдання (необовʼязково)</span>
            <input className="tm-sel tm-text" type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад: Осінній розпродаж (порожньо: назвемо за описом)" aria-label="Назва завдання" /></label>
          <TaskBrief value={v} onChange={(patch) => setV((x) => ({ ...x, ...patch }))} projectId={data.project.id} draftKey={draftKey} />
          <p className="tm-hint">Вартість роботи агентів ≈ $0.15–0.3 за завдання. Картинки Higgsfield генеруються лише після вашого підтвердження ціни.</p>
        </div>
        <footer className="tm-foot">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>Скасувати</button>
          <span className="tm-foot-note" />
          <button type="button" className="btn btn-p" disabled={busy || v.goal.trim().length < 3 || !v.ratios.length} onClick={create}>{busy ? 'Створюємо…' : paused ? 'Зберегти чернетку' : 'Створити й запустити'}</button>
        </footer>
      </div>
    </div>
  );
}
