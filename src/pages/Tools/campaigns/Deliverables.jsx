import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchRights } from '../../../lib/api/agentAudit';
import { editOutput } from '../../../lib/api/campaignControl';
import { decideDeliverable, fetchDeliverables } from '../../../lib/api/deliverables';
import { canDo } from '../../../lib/agents/rights';
import { KIND_LABEL, STATUS_LABEL, counts, fileNameOf, groupDeliverables, inputKeyOf } from '../../../lib/agents/deliverables';
import Markdown from '../../Smm/Markdown';
import { fmtDateTime } from '../../Smm/agentUi';
import '../../../styles/campaignsSection.css'; // the .dlv-* rules live there (the card of a project loads this component too)

const FILTERS = [['', 'Усі'], ['draft', 'Чекають рішення'], ['approved', 'Схвалені'], ['rejected', 'Повернуті']];

function download(d) {
  if (d.file_url) { window.open(d.file_url, '_blank', 'noopener'); return; }
  const url = URL.createObjectURL(new Blob([d.body || ''], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = fileNameOf(d); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// «Готові матеріали»: everything the agents delivered for a project or one operation (creatives, strategies, reports, analyses) with approve / return / download / edit by hand.
// A returned material asks for a reason: it goes to the memory of the client. An approved strategy or research becomes a field of the project card.
//   light: the look of the project card of the CRM (Hub style: white card, .btn / .btn-p); otherwise the dark look of the AI Agents section
//   head: the header of the block (the project card passes its own title)
export default function Deliverables({ projectId = null, campaignId = null, notify, light = false, head = null, only = null, onChanged = null }) {
  const { email } = useAuth();
  const [list, setList] = useState(null);
  const [rights, setRights] = useState({ approvers: [], isOps: false });
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);
  const [asking, setAsking] = useState(null); // { id, reason }
  const [editing, setEditing] = useState(null); // { id, text }
  const [busy, setBusy] = useState(0);
  const B = light ? 'btn' : 'cmp-btn';
  const BP = light ? 'btn btn-p' : 'cmp-btn cmp-btn--primary';
  const BD = light ? 'btn dlv-danger' : 'cmp-btn cmp-btn--danger';
  const MUTED = light ? 'dlv-muted' : 'cmp-muted';
  const INPUT = light ? 'dlv-input' : 'cmp-input';

  const load = useCallback(async () => {
    const [rows, r] = await Promise.all([fetchDeliverables({ projectId, campaignId }), fetchRights(email).catch(() => ({ approvers: [], isOps: false }))]);
    setList(rows); setRights(r);
  }, [projectId, campaignId, email]);
  useEffect(() => { load().catch((e) => { setList([]); notify?.(e.message || 'Не вдалося завантажити матеріали.', true); }); }, [load, notify]);

  const groups = useMemo(() => groupDeliverables(only != null ? (list || []).filter((d) => (Array.isArray(only) ? only.includes(d.id) : d.id === only)) : (list || []), { status: only != null ? '' : filter }), [list, filter, only]);
  const c = useMemo(() => counts(list || []), [list]);
  const allowed = canDo({ action: 'pass_on', email, approvers: rights.approvers, isOps: rights.isOps });
  const mayEdit = canDo({ action: 'edit_output', email, approvers: rights.approvers, isOps: rights.isOps });

  async function decide(d, status, reason = '') {
    if (!allowed.ok) { notify?.(allowed.reason, true); return; }
    setBusy(d.id);
    try {
      const r = await decideDeliverable(d, status, { email, reason });
      notify?.(status === 'approved' ? (r.wroteField ? 'Схвалено: дані додано в картку проєкту.' : 'Схвалено.') : 'Повернуто: причину збережено в памʼяті клієнта.');
      setAsking(null); await load(); onChanged?.();
    } catch (e) { notify?.(e.message || 'Не вдалося зберегти рішення.', true); } finally { setBusy(0); }
  }
  // the manager corrects the text of an agent's result: the server keeps the original and writes a note to the memory of the client
  async function saveEdit(d) {
    if (!mayEdit.ok) { notify?.(mayEdit.reason, true); return; }
    setBusy(d.id);
    try { await editOutput(d.source_id, editing.text); notify?.('Текст результату змінено. Оригінал збережено.'); setEditing(null); await load(); } catch (e) { notify?.(e.message || 'Не вдалося зберегти правку.', true); } finally { setBusy(0); }
  }
  const editable = (d) => d.source_table === 'ag_tasks' && d.source_id && d.body;

  return (
    <section className={(light ? 'pcr-card dlv dlv-light' : 'cmp-live dlv')}>
      {only == null && (head || <div className="cmp-live-head"><h3>Готові матеріали</h3><span className="cmp-muted">Усе, що зробили агенти: схваліть, поверніть із причиною, виправте текст або завантажте.</span></div>)}
      {list === null && <p className={MUTED}>Завантаження…</p>}
      {list && !list.length && <p className={MUTED}>Матеріалів ще немає. Вони зʼявляться, коли агенти завершать роботу (креативи, стратегія, звіти, аналізи).</p>}
      {list && list.length > 0 && (
        <>
          {only == null && <div className="dlv-filters" role="group" aria-label="Фільтр матеріалів">
            {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? BP : B} onClick={() => setFilter(k)}>{label} {k ? c[k] : c.all}</button>)}
          </div>}
          {!groups.length && <p className={MUTED}>У цьому фільтрі матеріалів немає.</p>}
          {groups.map((g) => (
            <div className="dlv-group" key={g.kind}>
              <h4 className="ccx-sub dlv-kind">{KIND_LABEL[g.kind]} ({g.items.length})</h4>
              <ul className={'dlv-list' + (g.kind === 'creative' ? ' is-grid' : '')}>
                {g.items.map((d) => (
                  <li key={d.id} className={'dlv-item is-' + d.status}>
                    {d.kind === 'creative' && d.file_url && <a className="dlv-thumb" href={d.file_url} target="_blank" rel="noreferrer noopener"><img src={d.file_url} alt={d.title} loading="lazy" /></a>}
                    <div className="dlv-main">
                      <b>{d.title}</b>
                      <span className={MUTED}>{fmtDateTime(d.created_at)}{d.approved_by ? ` · схвалив ${d.approved_by}` : ''}</span>
                      <span className={'dlv-chip is-' + d.status}>{STATUS_LABEL[d.status] || d.status}</span>
                      {inputKeyOf(d) && d.status !== 'approved' && <span className={MUTED}>Після схвалення потрапить у картку проєкту.</span>}
                    </div>
                    <div className="dlv-actions">
                      {d.body && <button type="button" className={B} onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? 'Згорнути' : 'Читати'}</button>}
                      {editable(d) && <button type="button" className={B} disabled={busy === d.id} onClick={() => { setOpen(null); setEditing(editing?.id === d.id ? null : { id: d.id, text: d.body }); }}>Виправити текст</button>}
                      <button type="button" className={B} onClick={() => download(d)}>Завантажити</button>
                      {d.status !== 'approved' && <button type="button" className={BP} disabled={busy === d.id} onClick={() => decide(d, 'approved')}>Схвалити</button>}
                      {d.status !== 'rejected' && <button type="button" className={B} disabled={busy === d.id} onClick={() => setAsking({ id: d.id, reason: '' })}>Повернути</button>}
                    </div>
                    {asking?.id === d.id && (
                      <div className="dlv-ask">
                        <textarea className={INPUT} rows={2} value={asking.reason} onChange={(e) => setAsking({ ...asking, reason: e.target.value })} placeholder="Чому повертаєте? Це збережеться в памʼяті клієнта, щоб агенти не повторювали помилку." aria-label="Причина повернення" />
                        <div className="ccx-add-row"><button type="button" className={BD} disabled={asking.reason.trim().length < 3 || busy === d.id} onClick={() => decide(d, 'rejected', asking.reason)}>Повернути</button><button type="button" className={B} onClick={() => setAsking(null)}>Скасувати</button></div>
                      </div>
                    )}
                    {editing?.id === d.id && (
                      <div className="dlv-ask">
                        <textarea className={INPUT} rows={12} value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} aria-label={`Текст результату: ${d.title}`} />
                        <div className="ccx-add-row"><button type="button" className={BP} disabled={editing.text.trim().length < 3 || editing.text === d.body || busy === d.id} onClick={() => saveEdit(d)}>{busy === d.id ? '…' : 'Зберегти правку'}</button><button type="button" className={B} onClick={() => setEditing(null)}>Скасувати</button></div>
                        <span className={MUTED}>Наступні агенти читатимуть уже виправлений текст. Оригінал агента зберігається.</span>
                      </div>
                    )}
                    {open === d.id && d.body && <div className="dlv-body"><Markdown text={d.body} /></div>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
