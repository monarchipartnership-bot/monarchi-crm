import { useMemo, useState } from 'react';
import { Avatar, Ic, Progress, WaitChip } from './parts';
import { fmtAgo, fmtDay, plural } from './format';
import { PLATFORM_LABEL, SORTS, filterSortProjects, projectCounts } from '../../../lib/agents/aiProjects';
import './cockpit.css';

// «Проєкти» of the AI Agents section: ONE card per client project (the addition to its CRM card), the operations run inside it.
//   rows: the project rows (lib/agents/aiProjects.buildProjectRows)  loading  ready: false = the table of the projects is not connected yet (read-only)
//   onOpen(row)  onCreate()  onFinish(row) «Завершити» → the archive  onRemove(row) «Видалити» from the section  onRestore(row) back to work   busyId: the project being changed
const FILTERS = [['all', 'Усі'], ['waiting', 'Чекають на вас'], ['working', 'Працюють']];
const opsLine = (o) => (o.total ? `${o.total} ${plural(o.total, 'операція', 'операції', 'операцій')}${o.active ? ` · ${o.active} ${plural(o.active, 'активна', 'активні', 'активних')}` : o.paused ? ' · на паузі' : ''}` : 'операцій ще немає');

export default function ProjectsPage({ rows = [], loading = false, ready = true, onOpen, onCreate, onFinish, onRemove, onRestore, busyId = null }) {
  const [tab, setTab] = useState('active'); // active | archive
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('attention');
  const counts = useMemo(() => projectCounts(rows), [rows]);
  const shown = useMemo(() => filterSortProjects(rows, { tab, filter, query, sort }), [rows, tab, filter, query, sort]);
  const filterCount = { all: counts.active, waiting: counts.waiting, working: counts.working };
  const empty = tab === 'archive'
    ? (counts.archive ? 'За цим пошуком в архіві нічого немає.' : 'В архіві поки порожньо: сюди потрапляють завершені проєкти.')
    : (counts.active ? 'За цим фільтром або пошуком проєктів немає.' : 'Проєктів ще немає. Натисніть «Створити проєкт», оберіть клієнта з кабінетом і розкажіть про нього агентам.');
  return (
    <main className="ckp ckp-page" aria-label="Проєкти">
      <header className="ckp-pg-head">
        <div className="ckp-pg-title">
          <div className="ckp-pg-kicker">AI Agents</div>
          <h2>Проєкти</h2>
          <p>Один проєкт на клієнта: доповнення до його картки в CRM. Операції запускаються всередині проєкту.</p>
        </div>
        <div className="ckp-pg-rings" role="group" aria-label="Підсумок">
          <div className="ckp-ringc"><b>{counts.active}</b><small>активних</small></div>
          <div className={'ckp-ringc' + (counts.waiting ? ' is-warn' : '')}><b>{counts.waiting}</b><small>{plural(counts.waiting, 'чекає', 'чекають', 'чекають')}</small></div>
          <div className="ckp-ringc"><b>{counts.archive}</b><small>в архіві</small></div>
        </div>
      </header>
      {!ready && <p className="ckp-pg-note" role="status">Проєкти показано за операціями, лише для перегляду: кнопки «Завершити» й «Видалити» запрацюють після міграції <code>20261059_ag_projects</code>.</p>}
      <div className="ckp-pg-tools">
        <div className="ckp-ribbon" role="tablist" aria-label="Проєкти">
          <button type="button" role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'is-on' : ''} onClick={() => setTab('active')}>Активні<em>{counts.active}</em></button>
          <button type="button" role="tab" aria-selected={tab === 'archive'} className={tab === 'archive' ? 'is-on' : ''} onClick={() => setTab('archive')}>Архів<em>{counts.archive}</em></button>
        </div>
        {tab === 'active' && (
          <div className="ckp-filt ckp-ribbon" role="group" aria-label="Фільтр проєктів">
            {FILTERS.map(([k, label]) => <button key={k} type="button" aria-pressed={filter === k} className={filter === k ? 'is-on' : ''} onClick={() => setFilter(k)}>{label}<em>{filterCount[k]}</em></button>)}
          </div>
        )}
        <label className="ckp-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук проєкту або клієнта" aria-label="Пошук проєкту" />
        </label>
        <label className="ckp-sort"><span>Сортування</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортування проєктів">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        </label>
        {onCreate && <button type="button" className="ckp-create" onClick={onCreate}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Створити проєкт</button>}
      </div>
      <div className="ckp-grid">
        {loading && !rows.length && [0, 1, 2].map((i) => <div key={i} className="ckp-skel ckp-skel-card" aria-hidden="true" />)}
        {shown.map((p) => {
          const done = p.status === 'done';
          const busy = busyId === p.id;
          return (
            <article key={p.id} className={'ckp-pcard ckp-pcard--project' + (done ? ' is-done' : p.tone === 'problem' ? ' is-bad' : p.waiting > 0 ? ' is-warn' : '')}>
              <button type="button" className="ckp-pcard-main" onClick={() => onOpen?.(p)} aria-label={`Відкрити проєкт ${p.client}`}>
                <span className="ckp-pcard-top"><Avatar name={p.client} size={44} /><span className="ckp-pcard-t"><b>{p.client}</b><small>{p.name && p.name !== p.client ? p.name : opsLine(p.operations)}</small></span>
                  {done ? <span className="ckp-chip is-ok">Завершено</span> : <WaitChip tone={p.tone} waiting={p.waiting} />}</span>
                <span className="ckp-pcard-meta">
                  {p.platforms.map((k) => <span key={k} className="ckp-chip">{PLATFORM_LABEL[k] || k}</span>)}
                  {!p.platforms.length && <span className="ckp-chip is-grey">без кабінету</span>}
                  <span>{p.name && p.name !== p.client ? opsLine(p.operations) : p.stageLabel}</span>
                </span>
                {!done && p.openCampaignId != null && <><span className="ckp-pcard-stage">{[p.modeLabel, p.stageLabel].filter(Boolean).join(' · ')}</span><Progress value={p.progress} /></>}
                <span className="ckp-pcard-foot">
                  <span>{done ? `завершено ${fmtDay(p.finishedAt) || '—'}` : `створено ${fmtDay(p.createdAt) || '—'}`}</span>
                  <span>оновлено {fmtAgo(p.updatedAt) || '—'}</span>
                  {!done && <span className="ckp-go">{p.openCampaignId != null ? 'Відкрити' : 'Запустити операцію'}<Ic n="arrow" size={15} /></span>}
                </span>
              </button>
              <div className="ckp-pcard-actions">
                {done
                  ? <button type="button" className="ckp-btn is-sm" disabled={busy || !ready} onClick={() => onRestore?.(p)}>Повернути в роботу</button>
                  : <button type="button" className="ckp-btn is-sm is-ok" disabled={busy || !ready} onClick={() => onFinish?.(p)}>Завершити</button>}
                <button type="button" className="ckp-btn is-sm is-danger" disabled={busy || !ready} onClick={() => onRemove?.(p)}>Видалити</button>
              </div>
            </article>
          );
        })}
        {!loading && !shown.length && <p className="ckp-empty-line">{empty}</p>}
      </div>
    </main>
  );
}
