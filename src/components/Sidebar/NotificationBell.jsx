import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from '../../lib/api/notifications';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDateOnly(iso) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}
function fmtTimeOnly(iso) {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

// Purple for a task, red for a call — 'reminder_call' always implies a
// call, but 'assigned' covers either, so it goes by the snapshotted
// activity_type (see notifications.js / send_task_reminders()) first.
const ACTIVITY_META = {
  task: { color: '#7C3AED', tint: '#EDE7FB', icon: 'checklist', label: 'Задача' },
  call: { color: '#DC2626', tint: '#FEE2E2', icon: 'phone', label: 'Дзвінок' },
  email: { color: '#DB2777', tint: '#FCE7F3', icon: 'email', label: 'Email' },
};
function activityMeta(n) {
  const type = n.activity_type || (n.type === 'reminder_call' ? 'call' : 'task');
  return ACTIVITY_META[type] || ACTIVITY_META.task;
}

// The 3 text fields every task/call notification (assigned or reminder)
// shows — угода / клієнт / опис — each with its own thematic icon;
// date/time render as separate colored chips instead (see describe()).
// All snapshotted onto the row at write time (notifications.js /
// send_task_reminders()), so nothing here needs to fetch deals/clients.
function taskFieldRows(n) {
  const rows = [];
  if (n.deal_title) rows.push({ label: 'Угода', value: n.deal_title, icon: FIELD_ICONS.pipeline });
  if (n.client_label) rows.push({ label: 'Клієнт', value: n.client_label, icon: FIELD_ICONS.user });
  if (n.note_excerpt) rows.push({ label: 'Опис', value: n.note_excerpt.slice(0, 120), icon: FIELD_ICONS.document });
  return rows;
}

// Plain-text sibling of describe() below, for the one spot that can't render
// JSX — the browser's native Notification API only takes strings.
function plainDescribe(n) {
  const who = n.sender_email || 'Хтось';
  const rows = taskFieldRows(n).map((r) => `${r.label}: ${r.value}`);
  if (n.task_scheduled_at) rows.push(`Дата: ${fmtDateOnly(n.task_scheduled_at)}`, `Час: ${fmtTimeOnly(n.task_scheduled_at)}`);
  switch (n.type) {
    case 'assigned':
      return { title: 'Нова задача', body: rows.join('\n') };
    case 'reminder_due':
    case 'reminder_call':
      return { title: 'Нагадування про задачу', body: rows.join('\n') };
    case 'mention':
    default:
      return { title: 'Згадка в нотатці', body: `${who} згадав(-ла) вас${n.note_excerpt ? ` — ${n.note_excerpt.slice(0, 80)}` : ''}` };
  }
}

// Autoplay policies block audio started with no user gesture behind it until
// the user has interacted with the page at least once — harmless to just
// try and swallow the rejection; it starts working after their first click.
function playNotificationSound() {
  try {
    const audio = new Audio('/notification-sound.mp3');
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

function showBrowserNotification(n) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const { title, body } = plainDescribe(n);
  try {
    const note = new Notification(title, { body, tag: 'monarchi-notif-' + n.id });
    note.onclick = () => window.focus();
  } catch { /* ignore */ }
}

// Every task/call notification (assigned or a reminder) links straight to
// that task's own popup on the Задачі page — not the deal — since that's
// what actually has the Скасувати/Виконано actions; falls back to the deal
// itself only for the rare case a notification predates task_id existing.
function taskLink(n) {
  if (n.task_id) return `/reports/deal-tasks?open=${n.task_id}`;
  return n.deal_id ? `/reports/deals?open=${n.deal_id}` : '/reports/deal-tasks';
}

// Shared body for 'assigned'/'reminder_due'/'reminder_call' — the 3 labeled
// fields (each with its own thematic icon) plus a date chip (green) and a
// time chip (yellow), rather than one combined "Час: ..." line.
function taskBody(n) {
  return (
    <div className="notif-card__fields">
      {taskFieldRows(n).map((r) => (
        <div className="notif-card__field" key={r.label}>
          <span className="notif-card__field-ic" dangerouslySetInnerHTML={{ __html: r.icon }} />
          <span><b>{r.label}:</b> {r.value}</span>
        </div>
      ))}
      {n.task_scheduled_at && (
        <div className="notif-card__chips">
          <span className="notif-card__chip notif-card__chip--date">
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.day }} />{fmtDateOnly(n.task_scheduled_at)}
          </span>
          <span className="notif-card__chip notif-card__chip--time">
            <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.history }} />{fmtTimeOnly(n.task_scheduled_at)}
          </span>
        </div>
      )}
    </div>
  );
}

function describe(n) {
  const who = n.sender_email || 'Хтось';
  switch (n.type) {
    case 'assigned':
    case 'reminder_due':
    case 'reminder_call': {
      const meta = activityMeta(n);
      return {
        iconNode: <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS[meta.icon] }} />,
        accentColor: meta.color, tintColor: meta.tint,
        badge: { label: meta.label, color: meta.color, tint: meta.tint },
        title: n.type === 'assigned' ? 'Нова задача' : 'Нагадування про задачу',
        body: taskBody(n),
        to: taskLink(n),
      };
    }
    case 'mention':
    default:
      return {
        iconNode: '\u{1F4AC}', tone: 'note',
        title: 'Згадка в нотатці',
        body: <><b>{who}</b> згадав(-ла) вас{n.note_excerpt && <> — «{n.note_excerpt.slice(0, 80)}»</>}</>,
        to: n.deal_id ? `/reports/deals?open=${n.deal_id}` : null,
      };
  }
}

// 'new' and 'unread' are the same underlying filter (!n.read) — two labels
// on purpose, not a bug: "Нові" is just the friendlier, default-selected
// name for the same list "Не прочитані" also shows.
const TABS = [
  { key: 'new', label: 'Нові' },
  { key: 'unread', label: 'Не прочитані' },
  { key: 'all', label: 'Усі' },
];

// How long the panel/backdrop take to slide out and fade — must match the
// CSS transition/animation durations below, since closing keeps the panel
// mounted (playing the reverse animation) for exactly this long instead of
// yanking it out of the DOM the instant `open` goes false.
const CLOSE_MS = 240;

export default function NotificationBell() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (open) { setRendered(true); return; }
    if (!rendered) return;
    const t = setTimeout(() => setRendered(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [open, rendered]);

  // Ask once per session — must follow a page load, not a click, but browsers
  // allow that for Notification (unlike audio autoplay).
  useEffect(() => {
    if (email && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [email]);

  useEffect(() => {
    if (!email) return;
    // `prevUnread` starts null so the very first poll (existing unread items
    // from before this session opened) never triggers a sound/notification —
    // only a genuine increase from here on does.
    let prevUnread = null;
    let cancelled = false;
    async function poll() {
      const count = await fetchUnreadCount(email);
      if (cancelled) return;
      setUnread(count);
      if (prevUnread !== null && count > prevUnread) {
        playNotificationSound();
        const fresh = (await fetchNotifications(email)).filter((n) => !n.read).slice(0, count - prevUnread);
        if (!cancelled) fresh.forEach(showBrowserNotification);
      }
      prevUnread = count;
    }
    poll();
    // Matches the ~10s cron cadence server-side reminders now fire on, so
    // the badge/sound/notification show up almost as soon as a reminder or
    // assignment notification is actually written.
    const timer = setInterval(poll, 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [email]);

  // Close on Escape, and stop the page from scrolling behind the panel
  // while it's open — the same pattern every other full-screen overlay in
  // the app uses.
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function handleToggle() {
    setOpen((o) => {
      const next = !o;
      if (next) { setTab('new'); fetchNotifications(email).then(setItems); }
      return next;
    });
  }

  async function handleItemClick(n) {
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
      await markNotificationRead(n.id);
    }
    const { to } = describe(n);
    setOpen(false);
    if (to) navigate(to);
  }

  async function handleMarkAll() {
    setUnread(0);
    setItems((list) => list.map((it) => ({ ...it, read: true })));
    await markAllNotificationsRead(email);
  }

  if (!email) return null;

  const shown = (tab === 'new' || tab === 'unread') ? items.filter((n) => !n.read) : items;

  return (
    <>
      <button type="button" className={'topbar-bell-btn' + (unread > 0 ? ' has-unread' : '')} title="Сповіщення" aria-label="Сповіщення" onClick={handleToggle}>
        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.bell }} />
        {unread > 0 && <span className="topbar-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {rendered && (
        <>
          <div className={'notif-backdrop' + (open ? '' : ' closing')} onClick={() => setOpen(false)} />
          <div className={'notif-panel' + (open ? '' : ' closing')} role="dialog" aria-label="Сповіщення">
            <div className="notif-panel__head">
              <div className="notif-panel__head-top">
                <div className="notif-panel__head-title">
                  Сповіщення{items.length > 0 && <span className="notif-panel__count-badge">{items.length}</span>}
                </div>
                <button type="button" className="notif-panel__close" aria-label="Закрити" onClick={() => setOpen(false)}>&times;</button>
              </div>
              <p className="notif-panel__subtitle">Будьте в курсі важливих подій у Mon&#39;Archi</p>

              <div className="notif-panel__tabs">
                {TABS.map((t) => (
                  <button
                    type="button" key={t.key}
                    className={'notif-panel__tab' + (tab === t.key ? ' active' : '')}
                    onClick={() => setTab(t.key)}
                  >
                    {t.label} ({(t.key === 'new' || t.key === 'unread') ? unread : items.length})
                  </button>
                ))}
                {unread > 0 && <button type="button" className="notif-panel__mark-all" onClick={handleMarkAll}>Позначити всі прочитаними</button>}
              </div>
            </div>

            <div className="notif-panel__list">
              {shown.map((n) => {
                const { iconNode, tone, accentColor, tintColor, badge, title, body, to } = describe(n);
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={'notif-card' + (n.read ? '' : ' unread') + (to ? '' : ' no-link')}
                    style={accentColor ? { borderLeftColor: accentColor } : undefined}
                    onClick={() => handleItemClick(n)}
                  >
                    <span
                      className={'notif-card__icon' + (tone ? ` notif-card__icon--${tone}` : '')}
                      style={accentColor ? { background: tintColor, color: accentColor } : undefined}
                    >
                      {iconNode}
                    </span>
                    <div className="notif-card__body">
                      <div className="notif-card__title-row">
                        <span className="notif-card__title">{title}</span>
                        <div className="notif-card__title-right">
                          {badge && (
                            <span className="notif-card__type-badge" style={{ color: badge.color, background: badge.tint, borderColor: `${badge.color}4D` }}>
                              {badge.label}
                            </span>
                          )}
                          {!n.read && <span className="notif-card__dot" />}
                        </div>
                      </div>
                      <div className="notif-card__desc">{body}</div>
                      <div className="notif-card__time">{fmtWhen(n.created_at)}</div>
                    </div>
                  </button>
                );
              })}

              <div className="notif-panel__end">
                <span className="notif-panel__end-ic">&#128276;</span>
                <div className="notif-panel__end-title">
                  {shown.length === 0 ? 'Сповіщень поки що немає' : 'Більше немає сповіщень'}
                </div>
                <p className="notif-panel__end-sub">Ми повідомимо вас, коли з&#39;являться нові події.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
