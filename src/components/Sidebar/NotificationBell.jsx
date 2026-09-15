import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchNotifications, fetchUnreadCount, markNotificationRead } from '../../lib/api/notifications';
import { FIELD_ICONS } from '../../lib/taskFieldIcons';

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationBell() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!email) return;
    fetchUnreadCount(email).then(setUnread);
    const timer = setInterval(() => fetchUnreadCount(email).then(setUnread), 60000);
    return () => clearInterval(timer);
  }, [email]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleToggle() {
    setOpen((o) => {
      const next = !o;
      if (next) fetchNotifications(email).then(setItems);
      return next;
    });
  }

  async function handleItemClick(n) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      await markNotificationRead(n.id);
    }
    if (n.deal_id) navigate(`/reports/deals?open=${n.deal_id}`);
  }

  if (!email) return null;

  return (
    <div className="topbar-bell-wrap" ref={wrapRef}>
      <button type="button" className={'topbar-bell-btn' + (unread > 0 ? ' has-unread' : '')} title="Сповіщення" aria-label="Сповіщення" onClick={handleToggle}>
        <span dangerouslySetInnerHTML={{ __html: FIELD_ICONS.bell }} />
        {unread > 0 && <span className="topbar-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="topbar-bell-menu">
          <div className="topbar-bell-menu-head">Сповіщення</div>
          {items.length === 0 ? (
            <p className="client-history-empty" style={{ padding: '4px 10px 8px' }}>Сповіщень поки що немає.</p>
          ) : (
            items.map((n) => (
              <button type="button" key={n.id} className={'topbar-bell-item' + (n.read ? '' : ' unread')} onClick={() => handleItemClick(n)}>
                <span className="topbar-bell-item-text">
                  {n.sender_email ? <b>{n.sender_email}</b> : <b>Хтось</b>} згадав(-ла) вас у нотатці
                  {n.note_excerpt && <span className="topbar-bell-item-excerpt"> — «{n.note_excerpt.slice(0, 60)}»</span>}
                </span>
                <span className="topbar-bell-item-time">{fmtWhen(n.created_at)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
