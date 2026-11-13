import { useState } from 'react';
import { fetchRunJournal } from '../../../lib/api/projectCockpit';
import { fmtUsd } from './format';
import '../../../styles/holdCard.css';
import '../../../styles/stepDetails.css';

// «Журнал завдання» (step 3.7, owner 2026-11-13): every run of the task stays in its card, finished or not, and opens at any moment with the WHOLE course of work: what each agent did,
// the questions and the answers, the pauses, the decisions of the quality checker, the money. The lines are read from the database when a run is opened (no window of days, no cap).
//   runs: the requests of the task [{ id, title, status, statusLabel, createdAt, updatedAt, cost: { model, higgsfield }, creatives: { total } }]
const hhmm = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const DOT = { running: 'is-run', done: 'is-ok', failed: 'is-bad', info: '' };

function Run({ run }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !rows) { try { setRows(await fetchRunJournal(run.id)); } catch (e) { setErr(e?.message || 'Не вдалося завантажити журнал.'); } }
  }
  const money = (run.cost?.model || 0) + (run.cost?.higgsfield || 0);
  return (
    <li className="rjn-run">
      <button type="button" className="rjn-head" aria-expanded={open} onClick={toggle}>
        <b>Завдання №{run.id}</b>
        <span className="ckp-chip">{run.statusLabel}</span>
        <small>{hhmm(run.createdAt)}{money ? ` · ${fmtUsd(money)}` : ''}{run.creatives?.total ? ` · креативів: ${run.creatives.total}` : ''}</small>
        <i aria-hidden="true">{open ? '−' : '+'}</i>
      </button>
      {open && (
        <div className="rjn-body">
          {err && <p className="ckp-err" role="alert">{err}</p>}
          {!rows && !err && <p className="rjn-note">Завантажуємо журнал…</p>}
          {rows && !rows.length && <p className="rjn-note">Рядків журналу немає: це завдання почало працювати до того, як журнал став зберігатись.</p>}
          {rows && rows.length > 0 && (
            <ol className="sd-feed">
              {rows.map((x) => (
                <li key={x.id} className={'sd-line ' + (DOT[x.state] || '') + (x.role === 'manager' ? ' is-mgr' : '')}>
                  <time dateTime={x.at}>{hhmm(x.at)}</time><i className="sd-dot" aria-hidden="true" />{x.label && <em>{x.label}</em>}<span>{x.text}</span>
                </li>
              ))}
            </ol>
          )}
          {run.cost && <p className="rjn-note">Витрати: модель {fmtUsd(run.cost.model || 0)}, Higgsfield {fmtUsd(run.cost.higgsfield || 0)}.</p>}
        </div>
      )}
    </li>
  );
}

export default function RunJournal({ runs = [] }) {
  if (!runs.length) return null;
  const sorted = [...runs].sort((a, b) => String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')));
  return (
    <section className="ckp-box rjn" aria-label="Журнал завдання">
      <div className="ckp-sec-h"><h3>Журнал завдання</h3><span className="ckp-chip">{sorted.length}</span></div>
      <p className="rjn-lead">Кожен запуск зберігається тут. Відкрийте його, щоб побачити весь хід роботи: що робив кожен агент, питання й відповіді, паузи, думку контролю якості, витрати.</p>
      <ul className="rjn-list">{sorted.map((r) => <Run key={r.id} run={r} />)}</ul>
    </section>
  );
}
