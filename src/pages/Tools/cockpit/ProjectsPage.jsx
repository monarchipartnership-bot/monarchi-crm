import { useMemo, useState } from 'react';
import { Avatar, Ic, Progress, WaitChip } from './parts';
import { fmtAgo, plural } from './format';
import './cockpit.css';

// «Проєкти»: the section page with every active project as a card, with the same marks as the card on the map and a filter «чекають».
//   projects: ActiveProject[]  loading  onOpen(id)  onCreate(): «Створити проєкт» (the wizard of the data the agents need)
const FILTERS = [['all', 'Усі'], ['waiting', 'Чекають на вас'], ['working', 'Працюють']];

export default function ProjectsPage({ projects = [], loading = false, onOpen, onCreate }) {
  const [filter, setFilter] = useState('all');
  const counts = useMemo(() => ({ all: projects.length, waiting: projects.filter((p) => p.waiting > 0).length, working: projects.filter((p) => !p.waiting).length }), [projects]);
  const shown = projects.filter((p) => filter === 'all' || (filter === 'waiting' ? p.waiting > 0 : !p.waiting));
  return (
    <main className="ckp ckp-page" aria-label="Проєкти">
      <header className="ckp-pg-head">
        <div className="ckp-pg-title">
          <div className="ckp-pg-kicker">AI Agents</div>
          <h2>Проєкти</h2>
          <p>Усі проєкти, над якими зараз працюють агенти.</p>
        </div>
        <div className="ckp-pg-rings" role="group" aria-label="Підсумок">
          <div className="ckp-ringc"><b>{counts.all}</b><small>активних</small></div>
          <div className={'ckp-ringc' + (counts.waiting ? ' is-warn' : '')}><b>{counts.waiting}</b><small>{plural(counts.waiting, 'чекає', 'чекають', 'чекають')}</small></div>
          <div className="ckp-ringc"><b>{counts.working}</b><small>{plural(counts.working, 'працює', 'працюють', 'працюють')}</small></div>
        </div>
      </header>
      <div className="ckp-pg-tools">
        <div className="ckp-filt ckp-ribbon" role="group" aria-label="Фільтр проєктів">
          {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{label}<em>{counts[k]}</em></button>)}
        </div>
        {onCreate && <button type="button" className="ckp-create" onClick={onCreate}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Створити проєкт</button>}
      </div>
      <div className="ckp-grid">
        {loading && !projects.length && [0, 1, 2].map((i) => <div key={i} className="ckp-skel ckp-skel-card" aria-hidden="true" />)}
        {shown.map((p) => (
          <button key={p.id} type="button" className={'ckp-pcard' + (p.tone === 'problem' ? ' is-bad' : p.waiting > 0 ? ' is-warn' : '')} onClick={() => onOpen?.(p.id)}>
            <span className="ckp-pcard-top"><Avatar name={p.client} size={44} /><span className="ckp-pcard-t"><b>{p.client}</b><small>{p.name}</small></span><WaitChip tone={p.tone} waiting={p.waiting} /></span>
            <span className="ckp-pcard-meta"><span className="ckp-chip">{p.modeLabel}</span><span>{p.stageLabel}</span></span>
            <Progress value={p.progress} />
            <span className="ckp-pcard-foot"><span>{Math.round((p.progress || 0) * 100)}%</span><span>оновлено {fmtAgo(p.updatedAt) || '—'}</span><span className="ckp-go">Відкрити<Ic n="arrow" size={15} /></span></span>
          </button>
        ))}
        {!loading && !shown.length && <p className="ckp-empty-line">{projects.length ? 'У цьому фільтрі проєктів немає.' : 'Зараз над проєктами ніхто не працює. Запустіть запит у операції, і проєкт з’явиться тут.'}</p>}
      </div>
    </main>
  );
}
