import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchQueueData } from '../../lib/api/workflow';
import { APPROVAL_KIND, ageText, approvalTitle, buildQueue } from '../../lib/workflow/view';
import { DecisionPanel, Pill } from '../../components/Workflow/parts';

const TONE = { strategy: 'warn', client: 'warn', launch: 'info', changes: 'bad' };

// «Апруви» (screen 3 of step A3, the variant A of the mockup): one queue of the decisions that wait for a manager, all clients together; on the right the decision panel of the chosen row.
export default function Approvals() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const load = useCallback(async () => {
    try { setQueue(buildQueue(await fetchQueueData())); setErr(''); } catch (e) { setErr(e.message || String(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!queue) return <div className="wf wf-page">{err ? <div className="wf-err" role="alert">{err}</div> : <div className="wf-load">Завантаження…</div>}</div>;
  const chosen = queue.find((q) => q.key === sel) || queue[0] || null;
  const onKey = (e, q) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(q.key); } };

  return (
    <div className="wf wf-page">
      {err && <div className="wf-err" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {queue.length === 0 ? (
        <div className="wf-card"><div className="wf-empty">Немає рішень, що чекають на вас. Коли агенти підготують стратегію, запуск або план на місяць, вони зʼявляться тут.</div></div>
      ) : (
        <div className="wf-grid wf-g2">
          <div className="wf-card">
            <h3>Черга апрувів · {queue.length}</h3>
            <div className="wf-tblwrap">
              <table className="wf-tbl">
                <thead><tr><th>Тип</th><th>Проєкт</th><th>Що</th><th>Чекає</th></tr></thead>
                <tbody>
                  {queue.map((q) => (
                    <tr key={q.key} className={'wf-tr' + (chosen?.key === q.key ? ' sel' : '')} tabIndex={0} aria-selected={chosen?.key === q.key} onClick={() => setSel(q.key)} onKeyDown={(e) => onKey(e, q)}>
                      <td><Pill tone={TONE[q.kind] || 'mute'}>{approvalTitle(q.kind)}</Pill></td>
                      <td><b>{q.project}</b></td>
                      <td className="wf-muted">{APPROVAL_KIND[q.kind]?.what}</td>
                      <td>{ageText(q.since)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {chosen && <DecisionPanel key={chosen.key} item={chosen} email={email} onDone={() => { setSel(null); load(); }} onOpenDossier={(section) => navigate(`/projects/${chosen.projectId}?tab=dossier&section=${section}`)} />}
        </div>
      )}
    </div>
  );
}
