import { useCallback, useEffect, useState } from 'react';
import { loadBriefContext, saveFact } from '../../lib/api/briefStore';
import { patchState } from '../../lib/api/workflow';
import { SECTIONS, checkBrief } from '../../lib/workflow/briefSchema';
import { Pill } from './parts';

// «Готовність до запуску» (owner's rule 2026-11-26): ONE list of everything the agents need before the process starts and before the first launch. What is missing can be typed here:
// it is written to the brief (or to the card) at once. The cabinet itself (pixel, page, right to write) is checked by the card under it.
export default function Preflight({ projectId, email, state, onChanged }) {
  const [ctx, setCtx] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => { try { setCtx(await loadBriefContext(projectId)); setErr(''); } catch (e) { setErr(e.message || String(e)); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!ctx) return err ? <div className="wf-card"><div className="wf-err" role="alert">{err}</div></div> : null;

  const r = checkBrief(ctx);
  const missingReq = r.items.filter((i) => !i.ok && i.level === 'required');
  const missingRec = r.items.filter((i) => !i.ok && i.level === 'recommended');
  const pct = r.required.total ? Math.round((r.required.ok / r.required.total) * 100) : 100;

  async function save(item) {
    setBusy(item.key); setErr('');
    try { await saveFact(projectId, item.key, drafts[item.key] || '', email); setDrafts((d) => ({ ...d, [item.key]: '' })); await load(); onChanged?.(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(''); }
  }
  async function flag(item) {
    setBusy(item.key); setErr('');
    try { await patchState(projectId, item.key === 'paid' ? { paid_at: new Date().toISOString() } : { contracts_signed_at: new Date().toISOString() }, email, item.key === 'paid' ? 'Оплату підтверджено.' : 'Договори підписано.'); await load(); onChanged?.(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(''); }
  }
  const link = (qs) => `/projects/${projectId}?tab=overview&info=${qs}`;
  const ask = (i) => {
    if (i.kind === 'flag') return <button type="button" className="wf-btn sm p" disabled={busy === i.key} onClick={() => flag(i)}>Підтвердити</button>;
    if (i.kind === 'files') return <a className="wf-btn sm" href={link('business')}>Додати фото</a>;
    if (i.kind === 'cabinet') return <a className="wf-btn sm" href={link('main')}>Підключити кабінет</a>;
    const long = i.kind === 'long';
    return (
      <>
        {long
          ? <textarea className="wf-ta wf-pf-in" rows={2} aria-label={i.label} placeholder={i.ask?.placeholder} value={drafts[i.key] || ''} onChange={(e) => setDrafts((d) => ({ ...d, [i.key]: e.target.value }))} />
          : <input className="wf-bd-in wf-pf-in" aria-label={i.label} placeholder={i.ask?.placeholder} value={drafts[i.key] || ''} inputMode={i.kind === 'number' ? 'decimal' : 'text'} onChange={(e) => setDrafts((d) => ({ ...d, [i.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter' && (drafts[i.key] || '').trim()) save(i); }} />}
        <button type="button" className="wf-btn sm p" disabled={busy === i.key || !(drafts[i.key] || '').trim()} onClick={() => save(i)}>Зберегти</button>
      </>
    );
  };
  const row = (i) => (
    <div key={i.key} className="wf-pf-row">
      <span className={'wf-pf-dot ' + (i.ok ? 'ok' : i.level === 'required' ? 'bad' : 'warn')} aria-hidden="true">{i.ok ? '✓' : i.level === 'required' ? '!' : '~'}</span>
      <div style={{ minWidth: 0 }}>
        <b>{i.label}</b>
        <div className="wf-muted" style={{ fontSize: 12.5 }}>{i.why}{i.needFor?.length ? ` Потрібне: ${i.needFor.join(', ')}.` : ''}</div>
        {!i.ok && <div className="wf-pf-ask">{ask(i)}</div>}
      </div>
      <Pill tone={i.ok ? 'ok' : i.level === 'required' ? 'bad' : 'warn'}>{i.ok ? 'є' : 'немає'}</Pill>
    </div>
  );

  return (
    <div className="wf-card">
      <div className="wf-row" style={{ justifyContent: 'space-between' }}>
        <div className="wf-row">
          <div className="wf-ring" style={{ '--p': pct }}><b>{r.required.ok}/{r.required.total}</b></div>
          <div>
            <h3 style={{ margin: 0 }}>Готовність до запуску</h3>
            <div className="wf-muted" style={{ fontSize: 13, marginTop: 2 }}>{r.ready ? 'Усе обов’язкове є. Можна запускати.' : `Не вистачає ${missingReq.length} обов’язкових речей: без них процес не піде далі.`}{missingRec.length ? ` Бажаного не вистачає: ${missingRec.length}.` : ''}</div>
          </div>
        </div>
        <button type="button" className="wf-btn sm" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Показати лише потрібне' : 'Показати все'}</button>
      </div>
      {err && <div className="wf-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 10 }}>
        {missingReq.length > 0 && <div className="wf-h">Обов’язкове</div>}
        {missingReq.map(row)}
        {missingRec.length > 0 && <div className="wf-h" style={{ marginTop: 10 }}>Бажане</div>}
        {missingRec.map(row)}
        {showAll && SECTIONS.map((s) => {
          const done = r.items.filter((i) => i.section === s.key && i.ok);
          return done.length ? <div key={s.key}><div className="wf-h" style={{ marginTop: 10 }}>{s.name}: є</div>{done.map(row)}</div> : null;
        })}
        {missingReq.length === 0 && missingRec.length === 0 && !showAll && <div className="wf-muted">Усе заповнено.</div>}
      </div>
    </div>
  );
}
