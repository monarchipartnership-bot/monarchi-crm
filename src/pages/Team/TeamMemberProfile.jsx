import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfile, profileLabel, fetchMyLeaveRequests } from '../../lib/api/profile';
import LeaveCard from '../../components/Team/LeaveCard';
import '../../styles/reportPage.css';
import '../../styles/clientsDirectory.css';
import '../../styles/clientProfile.css';
import '../../styles/teamPage.css';
import '../../styles/teamMembers.css';

const TABS = [
  { key: 'info', label: 'Основна інформація' },
  { key: 'leave', label: 'Відпустки' },
];

function initials(p) {
  const name = profileLabel(p);
  return (name || '?')[0].toUpperCase();
}

export default function TeamMemberProfile() {
  const { email: rawEmail } = useParams();
  const email = decodeURIComponent(rawEmail);
  const navigate = useNavigate();
  const { email: myEmail } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [leave, setLeave] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProfile(email).then((row) => { if (!cancelled) { setProfile(row); setLoading(false); } });
    fetchMyLeaveRequests(email).then((rows) => { if (!cancelled) setLeave(rows); });
    return () => { cancelled = true; };
  }, [email]);

  if (loading) return <div className="report-page"><div className="placeholder"><p>Завантаження…</p></div></div>;
  if (!profile) return <div className="report-page"><div className="placeholder"><p>Учасника не знайдено.</p></div></div>;

  return (
    <div className="report-page team-member-profile-page">
      <button type="button" className="btn client-profile-back" onClick={() => navigate('/team/members')}>&larr; Назад до команди</button>

      <section className="rpt-hero client-profile-hero">
        <span className="tm-avatar tm-avatar--lg">{profile.photo ? <img src={profile.photo} alt="" /> : initials(profile)}</span>
        <div>
          <div className="rpt-hero-heading">
            <h1>{profileLabel(profile)}</h1>
          </div>
          <p className="sub">{profile.position || 'Посада не вказана'}</p>
        </div>
        {email === myEmail && (
          <Link to="/account" className="btn tm-edit-btn">Редагувати профіль</Link>
        )}
      </section>

      <div className="client-panel-tabs client-profile-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={'client-panel-tab' + (activeTab === t.key ? ' active' : '')} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <section className="report-section client-profile-section">
        {activeTab === 'info' && (
          <div className="client-profile-info">
            <div className="task-filter-row"><label>Ім&#39;я та прізвище</label><span>{profileLabel(profile)}</span></div>
            <div className="task-filter-row"><label>Посада</label><span>{profile.position || '—'}</span></div>
            <div className="task-filter-row"><label>Телефон</label><span>{profile.phone || '—'}</span></div>
            <div className="task-filter-row"><label>Email</label><span>{profile.email}</span></div>
          </div>
        )}
        {activeTab === 'leave' && (
          <div className="leave-list">
            {leave.length === 0 ? (
              <div className="leave-empty">Заявок на відпустку чи лікарняний ще немає.</div>
            ) : (
              leave.map((r) => <LeaveCard key={r.id} row={r} profile={profile} />)
            )}
          </div>
        )}
      </section>
    </div>
  );
}
