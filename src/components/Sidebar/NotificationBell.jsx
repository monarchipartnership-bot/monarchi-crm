import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchNotifications, fetchUnreadCount, markNotificationRead, markAllNotificationsRead } from '../../lib/api/notifications';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Every notification is currently a deal-note mention (the only type the
// backend produces so far — see notifications.js) — this is the one place
// that turns a notification row into an icon/tone/title/body/link, so
// adding a second `type` later (deal updates, overdue tasks, etc. — see
// the reference mockup this card style is based on) only means adding a
// case here, not touching the panel's markup.
function describe(n) {
  const who = n.sender_email || 'Хтось';
  switch (n.type) {
    case 'mention':
    default:
      return {
        icon: '\u{1F4AC}', tone: 'note',
        title: 'Згадка в нотатці',
        body: <><b>{who}</b> згадав(-ла) вас{n.note_excerpt && <> — «{n.note_excerpt.slice(0, 80)}»</>}</>,
        to: n.deal_id ? `/reports/deals?open=${n.deal_id}` : null,
      };
  }
}

const TABS = [
  { key: 'all', label: 'Усі' },
  { key: 'unread', label: 'Непрочитані' },
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

  useEffect(() => {
    if (!email) return;
    fetchUnreadCount(email).then(setUnread);
    const timer = setInterval(() => fetchUnreadCount(email).then(setUnread), 60000);
    return () => clearInterval(timer);
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
      if (next) { setTab('all'); fetchNotifications(email).then(setItems); }
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

  const shown = tab === 'unread' ? items.filter((n) => !n.read) : items;

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
                    {t.label} ({t.key === 'unread' ? unread : items.length})
                  </button>
                ))}
                {unread > 0 && <button type="button" className="notif-panel__mark-all" onClick={handleMarkAll}>Позначити всі прочитаними</button>}
              </div>
            </div>

            <div className="notif-panel__list">
              {shown.map((n) => {
                const { icon, tone, title, body, to } = describe(n);
                return (
                  <button
                    type="button"
                    key={n.id}
                    className={'notif-card' + (n.read ? '' : ' unread') + (to ? '' : ' no-link')}
                    onClick={() => handleItemClick(n)}
                  >
                    <span className={`notif-card__icon notif-card__icon--${tone}`}>{icon}</span>
                    <div className="notif-card__body">
                      <div className="notif-card__title-row">
                        <span className="notif-card__title">{title}</span>
                        {!n.read && <span className="notif-card__dot" />}
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
