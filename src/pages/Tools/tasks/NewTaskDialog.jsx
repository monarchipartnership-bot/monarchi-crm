import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../contexts/AuthContext';
import useDialogA11y from '../../../lib/useDialogA11y';
import { fetchTeamsData } from '../../../lib/api/teams';
import Select from '../../../components/common/Select';
import NewRegularTask from '../../../components/Projects/Teams/NewRegularTask';
import OneOffCreativeDialog from '../../../components/Projects/Teams/OneOffCreativeDialog';
import '../../../styles/projectTeams.css';
import '../../../styles/projectTeamsPlum.css';

const KINDS = [
  ['regular', 'Регулярне', 'Запускається за своїм розкладом: щодня, кожні N днів чи в певні дні тижня.'],
  ['seasonal', 'Сезонне', 'Працює в межах дат: свята, розпродаж. Основне завдання на цей час можна призупинити.'],
  ['oneoff', 'Разове', 'Запускається один раз, зараз.'],
];

// «Нова задача» of the section «Задачі» (step 3.0b): first the project (the client whose creative team works), then the kind of the task; then the same window as in the card of the project.
//   campaigns: [{ id, project_id, name, status }] the creative operations that can take a task   names: { projectId: name }   onCreated(text)   onClose()
export default function NewTaskDialog({ campaigns, names = {}, onCreated, onClose }) {
  const { email } = useAuth();
  const box = useRef(null);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? null);
  const [kind, setKind] = useState('regular');
  const [step, setStep] = useState('pick'); // pick | form
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const campaign = campaigns.find((c) => c.id === campaignId) || null;
  useDialogA11y(box, () => { if (step === 'pick' && !busy) onClose(); });
  const options = useMemo(() => campaigns.map((c) => ({ value: c.id, label: names[c.project_id] || c.name })), [campaigns, names]);
  useEffect(() => { if (campaignId == null && campaigns[0]) setCampaignId(campaigns[0].id); }, [campaigns, campaignId]);

  async function next() {
    if (!campaign) return;
    setBusy(true); setError('');
    try { setData(await fetchTeamsData(campaign.project_id)); setStep('form'); } catch (e) { setError(e?.message || 'Не вдалося завантажити дані проєкту.'); } finally { setBusy(false); }
  }

  if (step === 'form' && data && campaign) {
    const done = (text) => { onCreated?.(text); onClose(); };
    return createPortal(
      <div className="tm-dialogs ts-dialogs" data-dd="hub">
        {kind === 'regular'
          ? <NewRegularTask data={data} campaign={campaign} email={email} onClose={onClose} onCreated={done} />
          : <OneOffCreativeDialog data={data} campaign={campaign} email={email} seasonal={kind === 'seasonal'} onClose={onClose} onCreated={done} />}
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div className="tm-dialogs ts-dialogs" data-dd="hub">
      <div className="tm-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
        <div ref={box} className="tm-win" role="dialog" aria-modal="true" aria-labelledby="nt-title" tabIndex={-1}>
          <header className="tm-head"><h2 id="nt-title">Нова задача</h2><button type="button" className="tm-x" onClick={onClose} disabled={busy} aria-label="Закрити">×</button></header>
          <div className="tm-body">
            <p className="tm-lead">Оберіть клієнта й вид задачі. Далі відкриється вікно задачі, таке саме, як у картці проєкту.</p>
            {error && <p className="pcr-error" role="alert">{error}</p>}
            {!campaigns.length && <p className="tm-hint">Креативних команд ще немає. Запустіть команду «Креативи» в картці проєкту, вкладка «Запуск AI команди».</p>}
            {campaigns.length > 0 && (
              <>
                <div className="tm-fl"><span>Клієнт</span>
                  <Select className="tm-ssel" value={campaignId} onChange={setCampaignId} options={options} ariaLabel="Клієнт, для якого створюється задача" />
                </div>
                <div className="tm-fl tm-w2"><span>Вид задачі</span>
                  <div className="tm-stance" role="radiogroup" aria-label="Вид задачі">
                    {KINDS.map(([k, label, hint]) => (
                      <label key={k} className={'tm-opt' + (kind === k ? ' on' : '')}><input type="radio" name="task-kind" checked={kind === k} onChange={() => setKind(k)} /><span><b>{label}</b><small>{hint}</small></span></label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <footer className="tm-foot">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>Скасувати</button>
            <span className="tm-foot-note" />
            <button type="button" className="btn btn-p" disabled={busy || !campaign} onClick={next}>{busy ? 'Завантажуємо…' : 'Далі'}</button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}
