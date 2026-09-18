import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAllProfiles, profileLabel } from '../../lib/api/profile';
import ProfileAvatar from '../common/ProfileAvatar';

const MAX_SHOWN = 5;

export default function TeamTodayCard() {
  const [profiles, setProfiles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchAllProfiles().then((rows) => { if (!cancelled) setProfiles(rows); });
    return () => { cancelled = true; };
  }, []);

  const shown = profiles?.slice(0, MAX_SHOWN) ?? [];

  return (
    <div className="pulse-card">
      <div className="pulse-card__head">
        <span className="pulse-card__title"><span className="pulse-card__ic">&#128101;</span>Команда</span>
        <Link to="/team/members" className="pulse-card__link">Всі {profiles?.length ?? ''} &rarr;</Link>
      </div>

      <div className="team-list">
        {profiles === null && <p className="sec-empty">Завантаження...</p>}
        {profiles?.length === 0 && <p className="sec-empty">Профілів ще немає.</p>}
        {shown.map((p) => (
          <div className="team-row" key={p.email}>
            <ProfileAvatar profile={p} email={p.email} className="team-row__avatar" fallbackColor="var(--purple)" />
            <div>
              <div className="team-row__name">{profileLabel(p)}</div>
              {p.position && <div className="team-row__role">{p.position}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
