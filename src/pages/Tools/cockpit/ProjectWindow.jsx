import { Fragment, useRef } from 'react';
import { createPortal } from 'react-dom';
import useDialogA11y from '../../../lib/useDialogA11y';
import { useAgentWindowNight } from '../../../components/AgentWorkspace/AgentWindowTheme';
import AttentionCard from './AttentionCard';
import { Avatar, IconBadge, Ic } from './parts';
import { creativesLine, fmtAgo, fmtDay, fmtUsd } from './format';
import './cockpit.css';

// The window of one project (variant A of 2026-11-02): the stage line of the chain of agents, «Потребує вашої уваги» on the left (always on top),
// the finished work and the costs on the right.
//   cockpit: Cockpit | null  loading  onClose  onAction(item, actionKey, payload) → Promise  onNewRequest  onStop  onOpenRequest(requestId)
const STAGE_ICON = { strategy: 'strategy', brief: 'doc', copy: 'pen', maker: 'img', quality: 'shield', you: 'user' };
const STATE_NOTE = { done: 'готово', working: 'працює…', waiting: 'чекає', failed: 'впав крок', idle: '' };
const REQ_CHIP = { draft: '', running: 'is-work', review: 'is-warn', problem: 'is-bad', approved: 'is-ok' };
const REQ_LABEL = { draft: 'чернетка', running: 'працює', review: 'на перегляд', problem: 'проблема', approved: 'затверджено' };

function Node({ s, here, you }) {
  const cls = s.state === 'working' ? 'is-work' : s.state === 'failed' ? 'is-fail' : s.state === 'done' ? 'is-done' : you ? 'is-you' : '';
  return (
    <div className={'ckp-node ' + cls}>
      {here && <span className="ckp-here">Зараз тут</span>}
      <span className="ckp-m"><Ic n={STAGE_ICON[s.key] || 'doc'} size={20} /></span>
      <b>{s.label}</b>
      <small>{s.note || STATE_NOTE[s.state] || ''}</small>
    </div>
  );
}

function StageLine({ stages = [], currentKey }) {
  // the stages with the same `parallel` mark that follow each other are drawn one over the other
  const groups = [];
  stages.forEach((s) => { const last = groups[groups.length - 1]; if (s.parallel && last && last.parallel === s.parallel) last.items.push(s); else groups.push({ parallel: s.parallel, items: [s] }); });
  return (
    <div className="ckp-chain" role="list" aria-label="Етап роботи">
      {groups.map((g, i) => {
        return (
          <Fragment key={g.items[0].key}>
            {i > 0 && <span className={'ckp-join' + (groups[i - 1].items.every((s) => s.state === 'done') ? ' is-done' : '')} aria-hidden="true" />}
            {g.parallel ? (
              <div className="ckp-par" role="list">{g.items.map((s) => <Node key={s.key} s={s} here={s.key === currentKey} you={false} />)}</div>
            ) : <Node s={g.items[0]} here={g.items[0].key === currentKey} you={g.items[0].key === 'you' && g.items[0].state === 'waiting'} />}
          </Fragment>
        );
      })}
    </div>
  );
}

function Spend({ spend }) {
  const s = spend || { model: 0, higgsfield: 0, total: 0 };
  const total = s.total || (s.model + s.higgsfield) || 0, m = total ? (s.model / total) * 100 : 0, h = total ? (s.higgsfield / total) * 100 : 0;
  return (
    <div className="ckp-cost">
      <div className="ckp-big"><b>{fmtUsd(total)}</b><span>за весь час проєкту</span></div>
      <div className="ckp-bar2" aria-hidden="true"><i className="a" style={{ width: m + '%' }} /><i className="b" style={{ width: h + '%' }} /></div>
      <div className="ckp-leg"><span><i style={{ background: '#B544B5' }} />Виклики моделі <b>{fmtUsd(s.model)}</b></span><span><i style={{ background: '#7C8CF8' }} />Higgsfield <b>{fmtUsd(s.higgsfield)}</b></span></div>
    </div>
  );
}

export default function ProjectWindow({ cockpit, loading = false, onClose, onAction, onNewRequest, onStop, onOpenRequest }) {
  const box = useRef(null);
  const night = useAgentWindowNight();
  useDialogA11y(box, onClose);
  const c = cockpit;
  const att = c?.attention || [];
  const failed = att.filter((a) => a.kind === 'failed_step').length;
  const working = c?.stages?.find((s) => s.state === 'working');
  const paused = c?.status === 'paused';
  return createPortal(
    <div className={'ckp ckp-overlay' + (night ? ' is-night' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={box} className="ckp-win" role="dialog" aria-modal="true" aria-label={c ? `Проєкт ${c.client}` : 'Проєкт'} tabIndex={-1}>
        <header className="ckp-whd">
          {c ? <Avatar name={c.client} size={48} /> : <span className="ckp-skel" style={{ width: 48, height: 48 }} />}
          <div className="ckp-wt">
            <h2>{c ? c.client : 'Проєкт'}{c && <span className={'ckp-chip ' + (paused ? '' : c.waiting ? 'is-warn' : 'is-work')}>{paused ? 'зупинено' : c.waiting ? 'чекає на вас' : 'працює'}</span>}</h2>
            <p>{c ? `${c.modeLabel} · ${c.name}${c.updatedAt ? ' · оновлено ' + fmtAgo(c.updatedAt) : ''}` : loading ? 'Завантажуємо проєкт…' : 'Проєкт не знайдено'}</p>
          </div>
          {c && <button type="button" className="ckp-btn is-primary" onClick={() => onNewRequest?.(c)}><Ic n="plus" size={16} />Новий запит</button>}
          {c && <button type="button" className="ckp-btn" onClick={() => onStop?.(c)}><Ic n={paused ? 'play' : 'stop'} size={16} />{paused ? 'Відновити' : 'Зупинити'}</button>}
          <button type="button" className="ckp-x ckp-x-lg" onClick={onClose} aria-label="Закрити вікно проєкту"><Ic n="close" size={17} /></button>
        </header>
        <div className="ckp-wbody">
          {!c && loading && <div className="ckp-skel ckp-skel-wide" aria-hidden="true" />}
          {!c && !loading && <p className="ckp-empty-line">Цей проєкт більше не активний або до нього немає доступу.</p>}
          {c && (
            <>
              <StageLine stages={c.stages} currentKey={c.currentStageKey} />
              <div className="ckp-cols">
                <section className="ckp-att" aria-label="Потребує вашої уваги">
                  <div className="ckp-sec-h">
                    <h3>Потребує вашої уваги</h3>
                    {att.length > 0 ? <span className="ckp-chip is-warn"><Ic n="clock" size={13} />{att.length}</span> : <span className="ckp-chip is-ok"><Ic n="check" size={13} />нічого</span>}
                    {failed > 0 && <span className="ckp-chip is-bad"><Ic n="warn" size={13} />{failed === 1 ? 'впав крок' : `впало кроків: ${failed}`}</span>}
                  </div>
                  {att.length === 0 && (
                    <div className="ckp-calm"><IconBadge n="check" tone="green" /><div><b>Усе гаразд</b><p>{working ? `Зараз працює ${working.label}. ` : ''}Коли з’являться креативи на перегляд або питання агентів, вони будуть тут.</p></div></div>
                  )}
                  {att.map((a) => <AttentionCard key={a.id} item={a} onAction={onAction} />)}
                </section>
                <div className="ckp-side">
                  <section className="ckp-box" aria-label="Готова робота">
                    <div className="ckp-sec-h"><h3>Готова робота</h3></div>
                    {(c.requests || []).length === 0 && <p className="ckp-empty-line">Запитів ще немає. Натисніть «Новий запит».</p>}
                    <div className="ckp-tbl">
                      {(c.requests || []).map((r) => (
                        <button key={r.id} type="button" className="ckp-tr" onClick={() => onOpenRequest?.(r.id)} aria-label={`Запит ${r.id}: ${r.title}`}>
                          <b>№{r.id}</b>
                          <span className="ckp-nm">{r.title}<small>{creativesLine(r.creatives)}</small></span>
                          <span className={'ckp-chip ' + (REQ_CHIP[r.status] || '')}>{r.statusLabel || REQ_LABEL[r.status] || r.status}</span>
                          <span className="ckp-dt">{fmtDay(r.updatedAt)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="ckp-box" aria-label="Витрати по проєкту">
                    <div className="ckp-sec-h"><h3>Витрати по проєкту</h3></div>
                    <Spend spend={c.spend} />
                  </section>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
