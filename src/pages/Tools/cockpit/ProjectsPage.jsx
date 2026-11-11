import { useMemo, useState } from 'react';
import { Avatar, Ic, WaitChip } from './parts';
import { fmtAgo, plural } from './format';
import { PLATFORM_LABEL, SORTS, filterSortTeamProjects, teamProjectCounts } from '../../../lib/agents/teamProjects';
import './cockpit.css';

// «Проєкти» of the AI Agents section (owner, 2026-11-12): only the projects for which AI teams are launched. A click opens the card of the project in the CRM, the tab
// «Запуск AI команди»: the teams are launched and controlled only there.
//   rows: lib/agents/teamProjects.buildTeamProjectRows   loading   onOpen(row)
const FILTERS = [['all', 'Усі'], ['waiting', 'Чекають на вас'], ['working', 'Працюють']];
const STATE_LABEL = { running: 'працює', paused: 'зупинено' };

export default function ProjectsPage({ rows = [], loading = false, onOpen }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('attention');
  const counts = useMemo(() => teamProjectCounts(rows), [rows]);
  const shown = useMemo(() => filterSortTeamProjects(rows, { filter, query, sort }), [rows, filter, query, sort]);
  const filterCount = { all: counts.all, waiting: counts.waiting, working: counts.working };
  const empty = counts.all
    ? 'За цим фільтром або пошуком проєктів немає.'
    : 'Поки жодна команда не запущена. Відкрийте проєкт у CRM і запустіть команду на вкладці «Запуск AI команди»: після цього проєкт зʼявиться тут.';
  return (
    <main className="ckp ckp-page" aria-label="Проєкти">
      <header className="ckp-pg-head">
        <div className="ckp-pg-title">
          <div className="ckp-pg-kicker">AI Agents</div>
          <h2>Проєкти</h2>
          <p>Проєкти, для яких запущені AI команди. Натисніть проєкт, щоб відкрити його картку з командами.</p>
        </div>
        <div className="ckp-pg-rings" role="group" aria-label="Підсумок">
          <div className="ckp-ringc"><b>{counts.all}</b><small>{plural(counts.all, 'проєкт', 'проєкти', 'проєктів')}</small></div>
          <div className={'ckp-ringc' + (counts.waiting ? ' is-warn' : '')}><b>{counts.waiting}</b><small>{plural(counts.waiting, 'чекає', 'чекають', 'чекають')}</small></div>
          <div className="ckp-ringc"><b>{counts.working}</b><small>працюють</small></div>
        </div>
      </header>
      <div className="ckp-pg-tools">
        <div className="ckp-filt ckp-ribbon" role="group" aria-label="Фільтр проєктів">
          {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{label}<em>{filterCount[k]}</em></button>)}
        </div>
        <label className="ckp-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук проєкту або клієнта" aria-label="Пошук проєкту" />
        </label>
        <label className="ckp-sort"><span>Сортування</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортування проєктів">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
      </div>
      <div className="ckp-grid">
        {loading && !rows.length && [0, 1, 2].map((i) => <div key={i} className="ckp-skel ckp-skel-card" aria-hidden="true" />)}
        {shown.map((p) => (
          <article key={p.id} className={'ckp-pcard ckp-pcard--project' + (p.tone === 'problem' ? ' is-bad' : p.waiting > 0 ? ' is-warn' : '')}>
            <button type="button" className="ckp-pcard-main" onClick={() => onOpen?.(p)} aria-label={`Відкрити проєкт ${p.client}`}>
              <span className="ckp-pcard-top"><Avatar name={p.client} size={44} /><span className="ckp-pcard-t"><b>{p.client}</b>{p.name && p.name !== p.client && <small>{p.name}</small>}</span><WaitChip tone={p.tone} waiting={p.waiting} /></span>
              <span className="ckp-pcard-meta">
                {p.teams.map((t) => <span key={t.key} className={'ckp-chip' + (t.state === 'running' ? ' is-work' : ' is-grey')}>{t.title} · {STATE_LABEL[t.state]}</span>)}
              </span>
              <span className="ckp-pcard-meta">
                {p.platforms.map((k) => <span key={k} className="ckp-chip">{PLATFORM_LABEL[k] || k}</span>)}
                {!p.platforms.length && <span className="ckp-chip is-grey">без кабінету</span>}
              </span>
              <span className="ckp-pcard-foot">
                <span>оновлено {fmtAgo(p.updatedAt) || '—'}</span>
                <span className="ckp-go">Відкрити проєкт<Ic n="arrow" size={15} /></span>
              </span>
            </button>
          </article>
        ))}
        {!loading && !shown.length && <p className="ckp-empty-line">{empty}</p>}
      </div>
    </main>
  );
}
