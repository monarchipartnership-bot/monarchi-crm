import { Avatar, IconBadge, Ic, Progress, WaitChip } from './parts';
import { plural } from './format';
import './cockpit.css';

// «Активні проєкти»: the card at the bottom right of the map (variant A of 2026-11-02). The projects agents work on right now, one row each:
// the client, the mode, the stage, the progress and the mark «чекає на вас: N» (amber; red when a step failed) or «усе гаразд».
//   projects: ActiveProject[]  collapsed / onToggle: the card folds into one line  onOpen(id): a click on a row  loading  onOpenAll: «Усі проєкти» (optional)
export default function ActiveProjectsCard({ projects = [], collapsed = false, onToggle, onOpen, loading = false, onOpenAll }) {
  const waiting = projects.filter((p) => p.waiting > 0).length;
  const n = projects.length;
  return (
    <section className={'ckp ckp-card' + (collapsed ? ' is-collapsed' : '')} aria-label="Активні проєкти" data-ai-safe>
      <header className="ckp-ph">
        <IconBadge n="folder" />
        <h3>Активні проєкти</h3>
        {collapsed && n > 0 && <span className="ckp-chip">{n}</span>}
        {collapsed && waiting > 0 && <span className="ckp-chip is-warn">{waiting} {plural(waiting, 'чекає', 'чекають', 'чекають')}</span>}
        {onToggle && (
          <button type="button" className="ckp-x" onClick={onToggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Розгорнути список проєктів' : 'Згорнути список проєктів'}>
            <span className={collapsed ? '' : 'ckp-flip'}><Ic n="chev" size={14} /></span>
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          {n > 0 && (
            <div className="ckp-sum">
              <span className="ckp-chip">{n} {plural(n, 'проєкт', 'проєкти', 'проєктів')}</span>
              {waiting > 0 ? <span className="ckp-chip is-warn"><Ic n="clock" size={13} />{waiting} {plural(waiting, 'чекає', 'чекають', 'чекають')} на вас</span> : <span className="ckp-chip is-ok"><Ic n="check" size={13} />усе гаразд</span>}
            </div>
          )}
          <div className="ckp-list">
            {loading && n === 0 && [0, 1, 2].map((i) => <div key={i} className="ckp-skel" aria-hidden="true" />)}
            {!loading && n === 0 && <p className="ckp-empty-line">Зараз над проєктами ніхто не працює. Запустіть запит, і він з’явиться тут.</p>}
            {projects.map((p) => (
              <button key={p.id} type="button" className="ckp-row" onClick={() => onOpen?.(p.id)} aria-label={`${p.client}, ${p.name}: ${p.stageLabel}`}>
                <Avatar name={p.client} />
                <span className="ckp-rt">
                  <b>{p.client}<small>{p.modeLabel}</small></b>
                  <span>{p.stageLabel}</span>
                  <Progress value={p.progress} />
                </span>
                <WaitChip tone={p.tone} waiting={p.waiting} />
              </button>
            ))}
          </div>
          {onOpenAll && n > 0 && <button type="button" className="ckp-all" onClick={onOpenAll}>Усі проєкти<Ic n="arrow" size={16} /></button>}
        </>
      )}
    </section>
  );
}
