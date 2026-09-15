import { useEffect, useState } from 'react';
import { fetchClientDirectory } from '../../lib/api/clients';
import { fetchAllDeals } from '../../lib/api/deals';
import { fetchRecentTasks } from '../../lib/api/tasks';
import { fetchProjects } from '../../lib/api/projects';
import { fetchRecentDealNotes } from '../../lib/api/dealNotes';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';

const MONTH_SHORT = ['січ.', 'лют.', 'бер.', 'квіт.', 'трав.', 'черв.', 'лип.', 'серп.', 'вер.', 'жовт.', 'лист.', 'груд.'];

function fmtWhen(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

function dealLabel(d) {
  return d.title || d.clients?.company || d.clients?.name || 'Угода';
}

const PAGE_SIZE = 8;
const FETCH_LIMIT = 15;

export default function ActivityFeedCard() {
  const [items, setItems] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [clients, deals, tasks, projects, notes, profiles] = await Promise.all([
        fetchClientDirectory(),
        fetchAllDeals(),
        fetchRecentTasks(FETCH_LIMIT),
        fetchProjects(),
        fetchRecentDealNotes(FETCH_LIMIT),
        fetchAllProfiles(),
      ]);
      if (cancelled) return;

      const nameByEmail = {};
      profiles.forEach((p) => { nameByEmail[p.email] = profileLabel(p); });

      const events = [];

      [...clients].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, FETCH_LIMIT).forEach((c) => {
        if (!c.created_at) return;
        events.push({
          key: `client-${c.id}`, icon: '\u{1F465}', tone: 'client', time: c.created_at,
          title: 'Додано нового клієнта', sub: c.company || c.name,
        });
      });

      deals.filter((d) => d.stage_changed_at).sort((a, b) => new Date(b.stage_changed_at) - new Date(a.stage_changed_at)).slice(0, FETCH_LIMIT).forEach((d) => {
        events.push({
          key: `deal-${d.id}`, icon: '\u{1F4C8}', tone: 'deal', time: d.stage_changed_at,
          title: 'Оновлено статус угоди', sub: `${dealLabel(d)} → ${d.deal_stages?.label || '—'}`,
        });
      });

      tasks.forEach((t) => {
        if (!t.created_at) return;
        events.push({
          key: `task-${t.id}`, icon: '✅', tone: 'task', time: t.created_at,
          title: 'Створено задачу', sub: (t.text || '').split('\n')[0],
        });
      });

      [...projects].filter((p) => p.updated_at).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, FETCH_LIMIT).forEach((p) => {
        events.push({
          key: `project-${p.id}`, icon: '\u{1F4E6}', tone: 'project', time: p.updated_at,
          title: 'Проект оновлено', sub: p.name,
        });
      });

      notes.forEach((n) => {
        events.push({
          key: `note-${n.id}`, icon: '\u{1F4AC}', tone: 'note', time: n.created_at,
          title: 'Додано коментар', sub: nameByEmail[n.created_by] || n.created_by || dealLabel(n.deals || {}),
        });
      });

      events.sort((a, b) => new Date(b.time) - new Date(a.time));
      if (!cancelled) setItems(events);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const shown = items?.slice(0, visibleCount) ?? [];
  const hasMore = (items?.length ?? 0) > visibleCount;

  return (
    <div className="pulse-card activity-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic">&#128340;</span>Останні оновлення</span>
      </div>

      <div className="activity-row">
        {items === null && <p className="sec-empty">Завантаження...</p>}
        {items?.length === 0 && <p className="sec-empty">Активності ще немає.</p>}
        {shown.map((it) => (
          <div className="activity-item" key={it.key}>
            <div className="activity-item__top">
              <span className={`activity-item__ic activity-item__ic--${it.tone}`}>{it.icon}</span>
              <span className="activity-item__time">{fmtWhen(it.time)}</span>
            </div>
            <div className="activity-item__title">{it.title}</div>
            {it.sub && <div className="activity-item__sub">{it.sub}</div>}
          </div>
        ))}
      </div>

      {hasMore && (
        <button type="button" className="pulse-card__cta" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Показати ще
        </button>
      )}
    </div>
  );
}
