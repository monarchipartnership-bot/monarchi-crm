import { useMemo, useState } from 'react';
import { Avatar, Ic, Progress, WaitChip } from './parts';
import { fmtAgo, plural } from './format';
import './cockpit.css';

// «Проєкти»: the section page with every active project as a card, with the same marks as the card on the map and a filter «чекають».
//   projects: ActiveProject[]  loading  onOpen(id)
const FILTERS = [['all', 'Усі'], ['waiting', 'Чекають на вас'], ['working', 'Працюють']];

export default function ProjectsPage({ projects = [], loading = false, onOpen }) {
  const [filter, setFilter] = useState('all');
  const counts = useMemo(() => ({ all: projects.length, waiting: projects.filter((p) => p.waiting > 0).length, working: projects.filter((p) => !p.waiting).length }), [projects]);
  const shown = projects.filter((p) => filter === 'all' || (filter === 'waiting' ? p.waiting > 0 : !p.waiting));
  return (
    <main className="ckp ckp-page" aria-label="Проєкти">
      <header className="ckp-pg-head">
        <div><h2>Проєкти</h2><p>{counts.all} {plural(counts.all, 'активний проєкт', 'активні проєкти', 'активних проєктів')}{counts.waiting ? `, ${counts.waiting} ${plural(counts.waiting, 'чекає', 'чекають', 'чекають')} на вас` : ''}</p></div>
        <div className="ckp-filt" role="group" aria-label="Фільтр проєктів">
          {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={'ckp-chip' + (filter === k ? ' is-on' : '')} onClick={() => setFilter(k)}>{label} {counts[k]}</button>)}
        </div>
      </header>
      <div className="ckp-grid">
        {loading && !projects.length && [0, 1, 2].map((i) => <div key={i} className="ckp-skel ckp-skel-card" aria-hidden="true" />)}
        {shown.map((p) => (
          <button key={p.id} type="button" className="ckp-pcard" onClick={() => onOpen?.(p.id)}>
            <span className="ckp-pcard-top"><Avatar name={p.client} size={44} /><span className="ckp-pcard-t"><b>{p.client}</b><small>{p.name}</small></span><WaitChip tone={p.tone} waiting={p.waiting} /></span>
            <span className="ckp-pcard-meta"><span className="ckp-chip">{p.modeLabel}</span><span>{p.stageLabel}</span></span>
            <Progress value={p.progress} />
            <span className="ckp-pcard-foot"><span>{Math.round((p.progress || 0) * 100)}%</span><span>оновлено {fmtAgo(p.updatedAt) || '—'}</span><span className="ckp-go">Відкрити<Ic n="arrow" size={15} /></span></span>
          </button>
        ))}
        {!loading && !shown.length && <p className="ckp-empty-line">{projects.length ? 'У цьому фільтрі проєктів немає.' : 'Зараз над проєктами ніхто не працює. Запустіть запит у кампанії, і проєкт з’явиться тут.'}</p>}
      </div>
    </main>
  );
}
