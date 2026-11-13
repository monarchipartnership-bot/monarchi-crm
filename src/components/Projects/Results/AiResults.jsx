import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useProjectCockpit from '../../../lib/useProjectCockpit';
import { fetchDeliverables } from '../../../lib/api/deliverables';
import { RUN_FILTERS, buildRuns, dateTimeText, filterRuns, groupItems, runCounts } from '../../../lib/agents/aiResults';
import Deliverables from '../../../pages/Tools/campaigns/Deliverables';
import StepCards from '../../../pages/Tools/cockpit/StepCards';
import CompareLooksDialog from '../../../pages/Tools/cockpit/CompareLooksDialog';
import VideoDialog from '../../../pages/Tools/cockpit/VideoDialog';
import QcLine from '../../../pages/Tools/cockpit/QcLine';
import ReturnDialog from '../../../pages/Tools/cockpit/ReturnDialog';
import TextEditDialog from '../../../pages/Tools/cockpit/TextEditDialog';
import { fmtUsd } from '../../../pages/Tools/cockpit/format';
import '../../../pages/Tools/cockpit/cockpit.css';
import './aiResults.css';

const STATE_CLASS = { wait: 'is-wait', ok: 'is-ok', work: 'is-work', stopped: 'is-bad' };
const ITEM_STATUS = { review: ['is-wait', 'на перегляд'], approved: ['is-ok', 'підтверджено'], rejected: ['is-back', 'повернено'], failed: ['is-bad', 'не вдалося'], producing: ['is-work', 'генерується'], planned: ['', 'чекає генерації'] };
const canApprove = (i) => i.status === 'review' || i.status === 'rejected';
const canReturn = (i) => i.status === 'review' || i.status === 'approved';
const canDownload = (i) => ['review', 'approved', 'rejected'].includes(i.status) && (i.downloadUrl || i.url);

// One creative of a run: the picture (a click opens it large), the name, the texts of the copywriter and the buttons. «Повернути» asks what is wrong (the picture is made again, or only the words are changed);
// «Редагувати текст» changes the words of a ready creative on the same picture (free).
//   styleCtx: { autoStyle, taskStyle } of the run (the editor of the words needs them)
function ResultCard({ item, onOpen, onAct, busy, styleCtx }) {
  const [returning, setReturning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [videoing, setVideoing] = useState(false);
  const [err, setErr] = useState('');
  const st = ITEM_STATUS[item.status] || ['', item.status];
  const canEditText = !!styleCtx && !!item.rawUrl && item.kind !== 'video' && ['review', 'approved'].includes(item.status);
  async function simple(key) { setErr(''); try { await onAct(key, { creativeId: item.id }); } catch (e) { setErr(e?.message || 'Не вдалося виконати дію.'); } }
  return (
    <li className="ar-card" data-st={item.status}>
      <button type="button" className="ar-pic" onClick={() => onOpen(item)} aria-label={`Відкрити: ${item.conceptName}`} style={{ aspectRatio: String(ratioOf(item.ratio)) }}>
        {item.url ? (item.kind === 'video' ? <video src={item.url} aria-label={item.conceptName} muted playsInline preload="metadata" /> : <img src={item.url} alt={item.conceptName} loading="lazy" />) : <span>{item.status === 'producing' ? 'Генерується…' : 'Немає картинки'}</span>}
        <span className={'ar-st ' + st[0]}>{st[1]}</span>
      </button>
      <div className="ar-cmain">
        <b>{item.conceptName}</b><small>{item.ratio || '4:5'}{item.kind === 'video' ? ' · відео' : ''}</small>
        {item.copy?.headline && <p className="ar-copy"><strong>{item.copy.headline}</strong>{item.copy.text ? ` ${item.copy.text}` : ''}</p>}
        {item.note && <p className="ar-note">{item.note}</p>}
        <QcLine qc={item.qc} />
      </div>
      <div className="ar-acts">
        {canApprove(item) && <button type="button" className="btn btn-p" disabled={!!busy} onClick={() => simple('approve_one')}>Схвалити</button>}
        {canReturn(item) && <button type="button" className="btn" disabled={!!busy} onClick={() => setReturning(true)}>Повернути</button>}
        {canEditText && <button type="button" className="btn" disabled={!!busy} onClick={() => setEditing(true)}>Редагувати текст</button>}
        {!!styleCtx && !!item.rawUrl && item.kind !== 'video' && ['review', 'approved', 'rejected'].includes(item.status) && <button type="button" className="btn" disabled={!!busy} onClick={() => setComparing(true)}>Порівняти реалізм</button>}
        {!!styleCtx && !!item.rawUrl && item.kind !== 'video' && ['review', 'approved', 'rejected'].includes(item.status) && <button type="button" className="btn" disabled={!!busy} onClick={() => setVideoing(true)}>Створити відео</button>}
        {canEditText && item.status === 'review' && <button type="button" className="btn" disabled={!!busy} onClick={() => simple('inspect')}>{item.qc ? 'Перевірити ще раз' : 'Перевірити якість'}</button>}
        {canDownload(item) && <button type="button" className="btn" disabled={!!busy} onClick={() => simple('download_one')} aria-label={`Завантажити: ${item.conceptName}`}>Завантажити</button>}
      </div>
      {err && <p className="ar-err" role="alert">{err}</p>}
      {returning && <ReturnDialog item={item} canEditText={canEditText} onClose={() => setReturning(false)} onRedo={(comment) => onAct('return', { creativeIds: [item.id], comment })} onText={() => { setReturning(false); setEditing(true); }} />}
      {videoing && <VideoDialog item={item} onAct={onAct} onClose={() => setVideoing(false)} />}
      {comparing && <CompareLooksDialog item={item} currentLook={styleCtx?.look || 'std'} onAct={onAct} onClose={() => setComparing(false)} />}
      {editing && styleCtx && <TextEditDialog item={item} autoStyle={styleCtx.autoStyle} taskStyle={styleCtx.taskStyle} onClose={() => setEditing(false)} onSave={(edit) => onAct('edit_text', { creativeId: item.id, edit })} />}
    </li>
  );
}
const ratioOf = (r) => { const [a, b] = String(r || '4:5').split(':').map(Number); return a > 0 && b > 0 ? a / b : 0.8; };

// The whole creative on the screen; arrows or the keys switch within the group, Escape or a click closes.
function Lightbox({ items, index, onClose, onGo }) {
  const item = items[index];
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowLeft') onGo(-1); else if (e.key === 'ArrowRight') onGo(1); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose, onGo]);
  if (!item?.url) return null;
  return createPortal(
    <div className="ar-light" role="dialog" aria-modal="true" aria-label={`Креатив: ${item.conceptName}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ar-light-bar"><b>{item.conceptName}</b><span>{item.ratio}</span><button type="button" className="btn" onClick={onClose}>Закрити</button></div>
      {items.length > 1 && <button type="button" className="ar-nav is-prev" onClick={() => onGo(-1)} aria-label="Попередній креатив">‹</button>}
      {item.kind === 'video' ? <video src={item.url} aria-label={item.conceptName} controls autoPlay playsInline loop /> : <img src={item.url} alt={item.conceptName} />}
      {items.length > 1 && <button type="button" className="ar-nav is-next" onClick={() => onGo(1)} aria-label="Наступний креатив">›</button>}
      {(item.copy?.headline || item.copy?.text) && <p className="ar-light-copy"><strong>{item.copy.headline}</strong> {item.copy.text} {item.copy.cta ? `· ${item.copy.cta}` : ''}</p>}
    </div>,
    document.body,
  );
}

// The card of a run of the creative team: the creatives in groups (to approve / approved / returned), the texts and the steps of the agents.
function CreativeRun({ run, onBack, onAct, styleCtx }) {
  const groups = useMemo(() => groupItems(run.items), [run.items]);
  const [light, setLight] = useState(null); // { items, index }
  const [busy, setBusy] = useState('');
  const act = useCallback(async (key, payload) => { setBusy(key); try { return await onAct(run, key, payload); } finally { setBusy(''); } }, [onAct, run]);
  const go = useCallback((d) => setLight((l) => (l ? { ...l, index: (l.index + d + l.items.length) % l.items.length } : l)), []);
  return (
    <div className="ar-run-card">
      <button type="button" className="ar-back" onClick={onBack}>← Усі запуски</button>
      <div className="ar-rhead">
        <h3>{run.title}</h3>
        <span className={'ar-kind is-' + run.kind}>{run.kindLabel}</span>
        <span className="ar-chip">{run.team}</span>
        {run.date && <span className="ar-chip">{dateTimeText(run.date)}</span>}
        {run.cost > 0 && <span className="ar-chip">Витрати {fmtUsd(run.cost)}</span>}
        <span className={'ar-state ' + (STATE_CLASS[run.state] || '')}>{run.stateText}</span>
      </div>
      {run.goal && <p className="ar-goal">{run.goal}</p>}
      {!run.items.length && <p className="ar-empty">Картинок у цьому запуску ще немає: {run.state === 'work' ? 'агенти працюють, кроки видно у вкладці «Запуск AI команди».' : 'агенти їх не зробили.'}</p>}
      {groups.filter((g) => g.items.length || g.key === 'review').map((g) => (
        <section key={g.key} className="ar-group" aria-label={g.label}>
          <div className="ar-ghead"><h4>{g.label}</h4><span className="ar-n">{g.items.length}</span>
            {g.key === 'review' && g.items.length > 1 && <button type="button" className="btn btn-p ar-all" disabled={!!busy} onClick={() => act('approve_all', { creativeIds: g.items.map((i) => i.id) })}>Схвалити всі ({g.items.length})</button>}
          </div>
          {!g.items.length ? <p className="ar-empty">Нічого не чекає вашого рішення.</p> : (
            <ul className="ar-grid">
              {g.items.map((i, k) => <ResultCard key={i.id} item={i} busy={busy} styleCtx={styleCtx} onOpen={() => setLight({ items: g.items.filter((x) => x.url), index: Math.max(0, g.items.filter((x) => x.url).findIndex((x) => x.id === i.id)) })} onAct={act} />)}
            </ul>
          )}
        </section>
      ))}
      {run.stages.length > 0 && (
        <details className="ar-agents">
          <summary>Агенти, тексти й технічне завдання</summary>
          <StepCards stages={run.stages} />
        </details>
      )}
      {light && <Lightbox items={light.items} index={light.index} onClose={() => setLight(null)} onGo={go} />}
    </div>
  );
}

// «Результати AI команди» (owner, 2026-11-12): the runs of the teams of a project as a list (what waits for the person comes first, then the newest), a run opens as a card.
//   projectId: the project of the card
export default function AiResults({ projectId }) {
  const { byId, loading, error, run: runAction } = useProjectCockpit();
  const [deliverables, setDeliverables] = useState([]);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [problem, setProblem] = useState('');
  const loadDeliverables = useCallback(() => fetchDeliverables({ projectId }).then(setDeliverables).catch(() => setDeliverables([])), [projectId]);
  useEffect(() => { loadDeliverables(); }, [loadDeliverables]);
  const cockpits = useMemo(() => Object.values(byId).filter((c) => Number(c.projectId) === Number(projectId)), [byId, projectId]);
  const runs = useMemo(() => buildRuns({ cockpits, deliverables }), [cockpits, deliverables]);
  const shown = useMemo(() => filterRuns(runs, filter), [runs, filter]);
  const counts = useMemo(() => runCounts(runs), [runs]);
  const open = runs.find((r) => r.id === openId) || null;
  useEffect(() => { if (openId && !open && !loading) setOpenId(null); }, [openId, open, loading]);
  // the look of the words: the scout's decision for the client and the style of the task of this run (the editor of the words of a creative starts from both)
  const styleOf = (r) => { const c = byId[r.campaignId]; if (!c?.intel) return null; return { autoStyle: c.intel.autoStyle, taskStyle: (c.requests || []).find((q) => q.id === r.requestId)?.brief?.style, look: (c.requests || []).find((q) => q.id === r.requestId)?.brief?.look }; };
  const onAct = useCallback(async (r, key, payload = {}) => {
    setProblem('');
    try { return await runAction(null, key, { campaignId: r.campaignId, requestId: r.requestId, ...payload }); } catch (e) { setProblem(e?.message || 'Не вдалося виконати дію.'); throw e; }
  }, [runAction]);

  return (
    <section className="ar ckp ar-scope" aria-label="Результати AI команди">
      {!open && (
        <>
          <div className="ar-head">
            <h3>Результати AI команди</h3>
            <p>Усі запуски команд цього клієнта: регулярні, сезонні й разові. Відкрийте запуск, щоб схвалити чи повернути креативи.</p>
          </div>
          {runs.length > 0 && (
            <div className="ar-filters" role="group" aria-label="Фільтр запусків">
              {RUN_FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={'btn' + (filter === k ? ' btn-p' : '')} onClick={() => setFilter(k)}>{label} {counts[k]}</button>)}
            </div>
          )}
          {loading && !runs.length && <p className="ar-empty">Завантаження…</p>}
          {error && <p className="ar-err" role="alert">{error}</p>}
          {!loading && !runs.length && <p className="ar-empty">Запусків ще немає. Вони зʼявляться, коли команди почнуть працювати: у вкладці «Запуск AI команди» можна запустити команду або створити додаткове завдання.</p>}
          {runs.length > 0 && !shown.length && <p className="ar-empty">У цьому фільтрі запусків немає.</p>}
          <ul className="ar-list">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" className={'ar-row ' + (STATE_CLASS[r.state] || '')} onClick={() => setOpenId(r.id)}>
                  <span className="ar-thumbs" aria-hidden="true">
                    {r.items.filter((i) => i.url && i.kind !== 'video').slice(0, 3).map((i) => <img key={i.id} src={i.url} alt="" loading="lazy" />)}
                    {!r.items.some((i) => i.url) && <span className="ar-nothumb">{r.state === 'work' ? '…' : '·'}</span>}
                  </span>
                  <span className="ar-rmain">
                    <b>{r.title}</b>
                    <small><span className={'ar-kind is-' + r.kind}>{r.kindLabel}</span>{r.team}{r.date ? ` · ${dateTimeText(r.date)}` : ''}{r.source === 'creative' && r.items.length ? ` · креативів: ${r.items.length}` : ''}</small>
                  </span>
                  <span className={'ar-state ' + (STATE_CLASS[r.state] || '')}>{r.stateText}</span>
                  <span className="ar-go" aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {open && open.source === 'creative' && <CreativeRun run={open} onBack={() => setOpenId(null)} onAct={onAct} styleCtx={styleOf(open)} />}
      {open && open.source === 'deliverable' && (
        <div className="ar-run-card">
          <button type="button" className="ar-back" onClick={() => setOpenId(null)}>← Усі запуски</button>
          <div className="ar-rhead"><h3>{open.title}</h3><span className={'ar-kind is-' + open.kind}>{open.kindLabel}</span><span className="ar-chip">{open.team}</span>{open.date && <span className="ar-chip">{dateTimeText(open.date)}</span>}</div>
          <Deliverables projectId={projectId} light only={open.deliverableIds} notify={(t, isErr) => { if (isErr) setProblem(t); }} onChanged={loadDeliverables} />
        </div>
      )}
      {problem && <p className="ar-err" role="alert">{problem}</p>}
    </section>
  );
}
