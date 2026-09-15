import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import '../../styles/reportPage.css';
import '../../styles/comparePage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/teamMembers.css';

const SEARCH_ICON = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>';

function initials(p) {
  const name = profileLabel(p);
  return (name || '?')[0].toUpperCase();
}

export default function TeamMembers() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchAllProfiles().then((rows) => { if (!cancelled) setProfiles(rows); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const list = profiles ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => profileLabel(p).toLowerCase().includes(q) || (p.position || '').toLowerCase().includes(q));
  }, [profiles, search]);

  function openMember(p) {
    navigate(`/team/members/${encodeURIComponent(p.email)}`);
  }

  return (
    <div className="report-page">
      <section className="rpt-hero">
        <h1>Команда</h1>
        <p className="sub">Усі учасники команди — базова інформація та історія відпусток/лікарняних.</p>
      </section>

      <section className="report-section">
        <div className="stitle">
          Учасники
          <div className="mc-client-toolbar tm-search-wrap">
            <div className="mc-client-search">
              <span dangerouslySetInnerHTML={{ __html: SEARCH_ICON }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук за ім'ям або посадою..." />
            </div>
          </div>
        </div>

        {profiles === null ? (
          <div className="placeholder"><p>Завантаження…</p></div>
        ) : filtered.length === 0 ? (
          <div className="placeholder"><p>{(profiles?.length ?? 0) === 0 ? 'Профілів ще немає.' : 'Немає учасників за цим пошуком.'}</p></div>
        ) : (
          <div className="tbl-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th>Учасник</th>
                  <th>Посада</th>
                  <th>Телефон</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.email} className="client-row" onClick={() => openMember(p)}>
                    <td className="ink client-name-cell">
                      <span className="tm-avatar">{p.photo ? <img src={p.photo} alt="" /> : initials(p)}</span>
                      <span>{profileLabel(p)}</span>
                    </td>
                    <td>{p.position || '—'}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
