import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfile } from '../../lib/api/profile';
import { greetingText, sunIcon, wishOfTheDay, formatFullDate, formatWeekdayTime } from '../../lib/greeting';

export default function GreetingBanner() {
  const { email } = useAuth();
  const [now, setNow] = useState(new Date());
  const [firstName, setFirstName] = useState('');

  // Keeps the sun stage, greeting and clock current without a full reload.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetchProfile(email).then((p) => { if (!cancelled) setFirstName(p?.first_name || ''); }).catch(() => {});
    return () => { cancelled = true; };
  }, [email]);

  return (
    <div className="greet-banner">
      <div className="greet-main">
        <span className="greet-sun">{sunIcon(now)}</span>
        <div>
          <h1>{greetingText(now)}{firstName ? `, ${firstName}` : ''}!</h1>
          <p>Готові до продуктивного дня? Ось головне, що потребує вашої уваги.</p>
        </div>
      </div>

      <div className="greet-cards">
        <div className="greet-card greet-card--quote">
          <span className="greet-card__icon">&#128172;</span>
          <div>
            <div className="greet-card__title">{wishOfTheDay(now)}</div>
            <div className="greet-card__sub">Mon&#39;Archi</div>
          </div>
        </div>
        <div className="greet-card greet-card--date">
          <div className="greet-card__title">{formatFullDate(now)}</div>
          <div className="greet-card__sub">{formatWeekdayTime(now)}</div>
        </div>
      </div>
    </div>
  );
}
