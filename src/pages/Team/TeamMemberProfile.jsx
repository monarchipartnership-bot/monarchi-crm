import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchProfile, profileLabel, fetchMyLeaveRequests, updateProfileRole } from '../../lib/api/profile';
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
  const { email: myEmail, profile: myProfile } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('info');
  const [leave, setLeave] = useState([]);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleMsg, setRoleMsg] = useState('');

  // §4.7 (docs/ai-agents-roadmap.md) — role can only be changed by an
  // existing ops_manager, and only for someone else (changing your own role
  // here would be indistinguishable from the self-assignment hole this was
  // built to close, so it's read-only on your own profile everywhere,
  // including here). Real enforcement is the RLS policy in
  // 20260930020000_harden_profiles_leave_requests_rls.sql -- this check is
  // just what decides whether to show the control at all, same as every
  // other role-based UI branch in this app (e.g. Account.jsx's isManager).
  const canEditRole = myProfile?.role === 'ops_manager' && email !== myEmail;

  async function handleRoleChange(newRole) {
    setRoleSaving(true);
    setRoleMsg('');
    try {
      await updateProfileRole(email, newRole);
      setProfile((p) => ({ ...p, role: newRole }));
      setRoleMsg('Збережено');
      setTimeout(() => setRoleMsg(''), 2000);
    } catch (e) {
      console.warn('updateProfileRole failed', e);
      setRoleMsg('Не вдалося змінити роль.');
    } finally {
      setRoleSaving(false);
    }
  }

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
            <div className="task-filter-row">
              <label>Роль</label>
              {canEditRole ? (
                <span className="tm-role-edit">
                  <select value={profile.role || 'member'} disabled={roleSaving} onChange={(e) => handleRoleChange(e.target.value)}>
                    <option value="member">Член команди</option>
                    <option value="ops_manager">Операційний менеджер</option>
                  </select>
                  {roleMsg && <span className="tm-role-msg">{roleMsg}</span>}
                </span>
              ) : (
                <span>{profile.role === 'ops_manager' ? 'Операційний менеджер' : 'Член команди'}</span>
              )}
            </div>
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
