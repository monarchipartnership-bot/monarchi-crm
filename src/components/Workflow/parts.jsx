import { useState } from 'react';
import { APPROVAL_KIND, STAGES, approvalTitle } from '../../lib/workflow/view';
import { decideApproval, recordClientAnswer } from '../../lib/api/workflow';
import '../../styles/workflowHub.css';

export function Pill({ tone = 'mute', children }) {
  return <span className={'wf-st ' + tone}><i />{children}</span>;
}

export function Stepper({ stage }) {
  return (
    <div className="wf-steps" role="list" aria-label="Етапи процесу">
      {STAGES.map((s) => (
        <div key={s.n} role="listitem" className={'wf-step ' + (s.n < stage ? 'done' : s.n === stage ? 'cur' : '')} aria-current={s.n === stage ? 'step' : undefined}>
          <div className="c">{s.n < stage ? '✓' : s.n}</div>
          <small>{s.title}</small><span>{s.hint}</span>
        </div>
      ))}
    </div>
  );
}

// The decision of the manager. item = { kind, projectId, id (null for the client sign-off that is to be recorded), project? }.
// A return needs a comment: the agent has to know what to fix.
export function DecisionPanel({ item, email, onDone, onOpenDossier }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sign = item.kind === 'client';
  const info = APPROVAL_KIND[item.kind] || { title: item.kind, what: '', check: '' };
  async function go(status) {
    setErr('');
    if (status === 'returned' && !comment.trim()) { setErr(sign ? 'Напишіть, що клієнт просить виправити.' : 'Щоб повернути, напишіть коментар: агент має знати, що виправити.'); return; }
    setBusy(true);
    try {
      if (item.id) await decideApproval({ id: item.id, project_id: item.projectId, kind: item.kind }, status, comment, email);
      else await recordClientAnswer(item.projectId, status, comment, email);
      setComment('');
      onDone?.();
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }
  return (
    <div className="wf-card wf-dec">
      <h3>{item.project ? `${item.project} · ` : ''}{approvalTitle(item.kind)}</h3>
      <h4>{info.what}</h4>
      <p className="wf-muted" style={{ margin: '4px 0 12px' }}>{info.check}</p>
      {item.subject?.actions?.length > 0 && (
        <div className="wf-col" style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Що пропонує оптимізатор{item.subject.period ? ` (${item.subject.period})` : ''}</h3>
          {item.subject.actions.map((a, i) => (
            <div key={i} className="wf-cm"><b>{a.name}: {{ off: 'вимкнути', scale: 'масштабувати', replace: 'замінити креатив', new_creative: 'новий креатив', keep: 'лишити' }[a.action] || a.action}</b>{a.reason}{a.effect ? <span className="wf-muted">Очікуваний ефект: {a.effect}</span> : null}</div>
          ))}
          <div className="wf-muted" style={{ fontSize: 12.5 }}>Поки це рекомендації: затвердження фіксує рішення, виконання в кабінеті робить менеджер. Рішення по кожній пропозиції окремо додамо на наступному кроці.</div>
        </div>
      )}
      <label htmlFor={'wf-cmt-' + item.projectId + item.kind} className="wf-muted" style={{ fontSize: 12.5 }}>{sign ? 'Коментар клієнта (обовʼязковий, якщо повернув)' : 'Коментар (обовʼязковий, якщо повертаєте)'}</label>
      <textarea id={'wf-cmt-' + item.projectId + item.kind} className="wf-cmt" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={sign ? 'Що просить виправити клієнт' : 'Що саме виправити'} />
      {err && <div className="wf-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div className="wf-row" style={{ marginTop: 10 }}>
        <button type="button" className="wf-btn p" disabled={busy} onClick={() => go('approved')}>{sign ? 'Клієнт погодив' : 'Схвалити'}</button>
        <button type="button" className="wf-btn d" disabled={busy} onClick={() => go('returned')}>{sign ? 'Клієнт повернув' : 'Повернути з коментарем'}</button>
        {onOpenDossier && <button type="button" className="wf-btn" style={{ marginLeft: 'auto' }} onClick={() => onOpenDossier(info.section)}>Відкрити Досьє</button>}
      </div>
    </div>
  );
}
