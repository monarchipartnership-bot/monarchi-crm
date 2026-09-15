import { useEffect, useRef, useState } from 'react';
import LeaveCard from '../../components/Team/LeaveCard';
import MiniTeamCalendar from '../../components/Account/MiniTeamCalendar';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { wishOfTheDay } from '../../lib/greeting';
import {
  fetchProfile, saveProfile, fetchMyLeaveRequests, submitLeaveRequest,
  cancelLeaveRequest, fetchPendingQueue, reviewLeaveRequest, markPasswordSet,
} from '../../lib/api/profile';
import { fetchProfilesByEmails } from '../../lib/api/leaveRequests';
import { logActivity, fetchRecentActivityForUser } from '../../lib/api/activityLog';
import '../../styles/reportPage.css';
import '../../styles/teamPage.css';
import '../../styles/accountPage.css';
import '../../styles/accountPageV2.css';

const EYE_ICON = '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON = '<svg viewBox="0 0 24 24"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a13.6 13.6 0 0 1-3.2 4.1M6.5 6.7C4 8.4 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.8-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const MAIL_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>';
const PHONE_ICON = '<svg viewBox="0 0 24 24"><path d="M6.5 3h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2z"/></svg>';
const PIN_ICON = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.3"/></svg>';
const CAMERA_ICON = '<svg viewBox="0 0 24 24"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="14" r="3.5"/></svg>';
const PERSON_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>';
const EDIT_ICON = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const SHIELD_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/></svg>';

function initials(name, email) {
  if (name?.trim()) return name.trim()[0].toUpperCase();
  return (email || '?')[0].toUpperCase();
}

// Maps an activity_log row to something showable in "Останні дії" — the
// four `account` event types below are logged from this page/AuthContext;
// any other `tool` (Image Studio, Followup Generator, ...) gets a generic
// fallback line so their existing rows still show up sensibly here too.
function describeActivity(row) {
  if (row.tool === 'account') {
    switch (row.event_type) {
      case 'login': return { icon: '\u{1F511}', title: 'Вхід у систему' };
      case 'profile_updated': return { icon: '\u{1F4DD}', title: 'Оновлено профіль' };
      case 'password_changed': return { icon: '\u{1F512}', title: 'Змінено пароль' };
      case 'leave_request_created': return { icon: '\u{1F4C4}', title: 'Створено заявку на відпустку' };
      default: return { icon: '\u{1F553}', title: 'Дія в кабінеті' };
    }
  }
  const toolName = { image_studio: 'Image Studio', followup: 'Follow-up Generator' }[row.tool] || row.tool;
  return { icon: '\u{2728}', title: `Використано ${toolName}` };
}

function fmtWhen(iso) {
  return new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function Account() {
  const { email, refreshProfile } = useAuth();
  const fileInputRef = useRef(null);
  const avatarMenuRef = useRef(null);

  const [form, setForm] = useState({ first_name: '', last_name: '', position: '', phone: '', location: '', role: 'member' });
  const [photo, setPhoto] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ text: '', error: false });
  const [saving, setSaving] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);

  const [myRequests, setMyRequests] = useState([]);
  const [reqForm, setReqForm] = useState({ type: 'vacation', start: '', end: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const [isManager, setIsManager] = useState(false);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState({});

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: '', error: false });

  const [activity, setActivity] = useState([]);

  function reloadActivity() {
    fetchRecentActivityForUser(email, 6).then(setActivity);
  }

  useEffect(() => {
    if (!email) return;
    (async () => {
      try {
        const p = await fetchProfile(email);
        const loaded = {
          first_name: p?.first_name || '',
          last_name: p?.last_name || '',
          position: p?.position || '',
          phone: p?.phone || '',
          location: p?.location || '',
          role: p?.role || 'member',
        };
        setForm(loaded);
        setPhoto(p?.photo || null);
        setIsManager(p?.role === 'ops_manager');
      } catch (e) {
        console.warn('loadProfile failed', e);
      }
    })();
    reloadMyRequests();
    reloadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (isManager) reloadPendingQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    function onDocClick(e) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target)) setAvatarMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [avatarMenuOpen]);

  async function reloadMyRequests() {
    try {
      setMyRequests(await fetchMyLeaveRequests(email));
    } catch (e) {
      console.warn('loadMyRequests failed', e);
    }
  }

  async function reloadPendingQueue() {
    try {
      const rows = await fetchPendingQueue();
      setPendingQueue(rows);
      setPendingProfiles(await fetchProfilesByEmails(rows.map((r) => r.email)));
    } catch (e) {
      console.warn('loadPendingQueue failed', e);
    }
  }

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await saveProfile({ email, ...form, photo, updated_at: new Date().toISOString() });
      setIsManager(form.role === 'ops_manager');
      setSaveMsg({ text: 'Збережено', error: false });
      setTimeout(() => setSaveMsg({ text: '', error: false }), 2500);
      logActivity('account', 'profile_updated', {}, email);
      reloadActivity();
      refreshProfile();
      setEditOpen(false);
    } catch (e) {
      console.warn('saveProfile failed', e);
      setSaveMsg({ text: 'Помилка збереження', error: true });
    } finally {
      setSaving(false);
    }
  }

  // "Скасувати" only collapses the panel — nothing is written to the
  // database until "Зберегти зміни" is clicked, so there is nothing to
  // revert here; it just clears the one-shot password fields.
  function handleCancelEdit() {
    setNewPassword('');
    setConfirmPassword('');
    setPwMsg({ text: '', error: false });
    setEditOpen(false);
  }

  async function handleChangePassword() {
    setPwMsg({ text: '', error: false });
    if (newPassword.length < 8) { setPwMsg({ text: 'Пароль має містити щонайменше 8 символів.', error: true }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ text: 'Паролі не збігаються.', error: true }); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      await markPasswordSet(email);
      setNewPassword(''); setConfirmPassword('');
      setPwMsg({ text: 'Пароль оновлено', error: false });
      setTimeout(() => setPwMsg({ text: '', error: false }), 2500);
      logActivity('account', 'password_changed', {}, email);
      reloadActivity();
    } catch (e) {
      setPwMsg({ text: 'Не вдалося оновити пароль: ' + (e.message || 'спробуйте ще раз.'), error: true });
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSubmitRequest() {
    if (!reqForm.start || !reqForm.end) { alert('Оберіть дату початку і закінчення.'); return; }
    if (reqForm.end < reqForm.start) { alert('Дата закінчення не може бути раніше дати початку.'); return; }
    setSubmitting(true);
    try {
      await submitLeaveRequest({ email, ...reqForm });
      setReqForm({ type: 'vacation', start: '', end: '', reason: '' });
      await reloadMyRequests();
      logActivity('account', 'leave_request_created', { type: reqForm.type }, email);
      reloadActivity();
    } catch (e) {
      console.warn('submitRequest failed', e);
      alert('Не вдалося подати заявку.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id) {
    try {
      await cancelLeaveRequest(id);
      await reloadMyRequests();
    } catch (e) {
      console.warn('cancelRequest failed', e);
      alert('Не вдалося скасувати заявку.');
    }
  }

  async function handleReview(id, status) {
    try {
      await reviewLeaveRequest(id, status, email);
      await reloadPendingQueue();
    } catch (e) {
      console.warn('reviewRequest failed', e);
      alert('Не вдалося оновити заявку.');
    }
  }

  function scrollToMyRequests() {
    document.getElementById('my-requests-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const pendingCount = myRequests.filter((r) => r.status === 'pending').length;
  const fullName = `${form.first_name} ${form.last_name}`.trim();

  return (
    <div className="report-page account-page-v2">
      <div className="account-layout">
        <div className="account-col-left">
          <div className="acp-card acp-profile-card">
            <span className="acp-status-badge"><span className="acp-status-dot" />Активний</span>

            <div className="acp-avatar-wrap" ref={avatarMenuRef}>
              <div className="avatar-preview acp-avatar-lg">
                {photo ? <img src={photo} alt="" /> : initials(form.first_name, email)}
              </div>
              <button type="button" className="acp-avatar-cam" onClick={() => setAvatarMenuOpen((o) => !o)} aria-label="Змінити фото">
                <span dangerouslySetInnerHTML={{ __html: CAMERA_ICON }} />
              </button>
              {avatarMenuOpen && (
                <div className="acp-avatar-menu">
                  <button type="button" onClick={() => { setAvatarMenuOpen(false); fileInputRef.current?.click(); }}>Змінити фото</button>
                  {photo && <button type="button" onClick={() => { setAvatarMenuOpen(false); setPhoto(null); }}>Прибрати фото</button>}
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            </div>

            <div className="acp-name">{fullName || email}</div>
            {form.position && <div className="acp-position">{form.position}</div>}
            <span className="acp-role-badge">
              <span dangerouslySetInnerHTML={{ __html: PERSON_ICON }} />
              {form.role === 'ops_manager' ? 'Операційний менеджер' : 'Член команди'}
            </span>

            <div className="acp-contacts">
              <div className="acp-contact-row"><span dangerouslySetInnerHTML={{ __html: MAIL_ICON }} />{email}</div>
              {form.phone && <div className="acp-contact-row"><span dangerouslySetInnerHTML={{ __html: PHONE_ICON }} />{form.phone}</div>}
              {form.location && <div className="acp-contact-row"><span dangerouslySetInnerHTML={{ __html: PIN_ICON }} />{form.location}</div>}
            </div>

            <p className="acp-quote">&laquo;{wishOfTheDay()}&raquo;</p>
          </div>

          <button type="button" className="acp-card acp-mini-card" onClick={scrollToMyRequests}>
            <div className="acp-mini-card__head">
              <span className="acp-mini-card__ic">&#128220;</span>
              <span>Мої заявки</span>
            </div>
            <div className="acp-mini-card__value">{myRequests.length}{pendingCount > 0 && <span className="acp-mini-card__delta">+{pendingCount}</span>}</div>
            <div className="acp-mini-card__sub">активних заявок</div>
          </button>

          <div className="acp-card acp-mini-card acp-mini-card--static">
            <div className="acp-mini-card__head">
              <span className="acp-mini-card__ic">&#128274;</span>
              <span>Доступ / роль</span>
            </div>
            <div className="acp-mini-card__role">{form.role === 'ops_manager' ? 'Операційний менеджер' : 'Член команди'}</div>
            {form.position && <div className="acp-mini-card__sub">{form.position}</div>}
          </div>
        </div>

        <div className="account-col-right">
          <section className="acp-card">
            <div className="acp-section-head">
              <div className="acp-section-title">
                <span className="acp-header-ic" dangerouslySetInnerHTML={{ __html: EDIT_ICON }} />
                <span className="stitle" style={{ margin: 0 }}>Редагування профілю</span>
              </div>
              {editOpen ? (
                <div className="acp-section-actions">
                  <button type="button" className="btn" onClick={handleCancelEdit} disabled={saving}>Скасувати</button>
                  <button type="button" className="btn btn-p" onClick={handleSaveProfile} disabled={saving}>
                    {saving ? '...' : <>&#10003; Зберегти зміни</>}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn" onClick={() => setEditOpen(true)}>Налаштувати</button>
              )}
            </div>
            <span className="save-msg" style={saveMsg.error ? { color: 'var(--bad)' } : undefined}>{saveMsg.text}</span>

            {editOpen && (
              <>
                <div className="acp-subgroup-head">
                  <span className="acp-subgroup-ic" dangerouslySetInnerHTML={{ __html: PERSON_ICON }} />
                  <span className="acp-subgroup-title">Особисті дані</span>
                </div>
                <div className="profile-fields">
                  <div className="pf"><label>Ім&#39;я</label><input type="text" value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} placeholder="Ім'я" /></div>
                  <div className="pf"><label>Прізвище</label><input type="text" value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} placeholder="Прізвище" /></div>
                  <div className="pf"><label>Посада</label><input type="text" value={form.position} onChange={(e) => setField('position', e.target.value)} placeholder="напр. Sales Manager" /></div>
                  <div className="pf">
                    <label>Роль</label>
                    <select value={form.role} onChange={(e) => setField('role', e.target.value)}>
                      <option value="member">Член команди</option>
                      <option value="ops_manager">Операційний менеджер</option>
                    </select>
                  </div>
                  <div className="pf pf-full">
                    <div className="role-note">Роль поки що впливає лише на інтерфейс (хто бачить заявки на розгляд) — без окремої перевірки прав доступу це ще не є повноцінним захистом.</div>
                  </div>
                </div>
                <div className="acp-divider" />

                <div className="acp-subgroup-head">
                  <span className="acp-subgroup-ic" dangerouslySetInnerHTML={{ __html: PHONE_ICON }} />
                  <span className="acp-subgroup-title">Контакти</span>
                </div>
                <div className="profile-fields">
                  <div className="pf"><label>Email</label><input type="text" value={email || ''} readOnly /></div>
                  <div className="pf"><label>Телефон</label><input type="text" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+380..." /></div>
                  <div className="pf"><label>Локація</label><input type="text" value={form.location} onChange={(e) => setField('location', e.target.value)} placeholder="напр. Київ, Україна" /></div>
                </div>
                <div className="acp-divider" />

                <div className="acp-subgroup-head">
                  <span className="acp-subgroup-ic" dangerouslySetInnerHTML={{ __html: LOCK_ICON }} />
                  <span className="acp-subgroup-title">Безпека</span>
                </div>
                <div className="acp-security-row">
                  <div className="pf">
                    <label>Новий пароль</label>
                    <div className="pw-field">
                      <input type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Щонайменше 8 символів" autoComplete="new-password" />
                      <button type="button" className="pw-eye" onClick={() => setShowNewPw((v) => !v)} aria-label="Показати пароль" dangerouslySetInnerHTML={{ __html: showNewPw ? EYE_OFF_ICON : EYE_ICON }} />
                    </div>
                  </div>
                  <div className="pf">
                    <label>Повторіть пароль</label>
                    <div className="pw-field">
                      <input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ще раз той самий пароль" autoComplete="new-password" />
                      <button type="button" className="pw-eye" onClick={() => setShowConfirmPw((v) => !v)} aria-label="Показати пароль" dangerouslySetInnerHTML={{ __html: showConfirmPw ? EYE_OFF_ICON : EYE_ICON }} />
                    </div>
                  </div>
                  <div className="acp-2fa-block">
                    <div className="acp-2fa-info">
                      <span className="acp-2fa-ic" dangerouslySetInnerHTML={{ __html: SHIELD_ICON }} />
                      <div>
                        <div className="acp-2fa-title">Двофакторна автентифікація</div>
                        <div className="acp-2fa-sub">Підвищіть безпеку свого облікового запису</div>
                      </div>
                    </div>
                    <button type="button" className="btn acp-2fa-btn" disabled title="Скоро">Увімкнути</button>
                  </div>
                </div>
                <div className="profile-actions" style={{ marginTop: 12 }}>
                  <button type="button" className="btn btn-p" onClick={handleChangePassword} disabled={pwSaving}>
                    {pwSaving ? '...' : <>&#10003; Оновити пароль</>}
                  </button>
                  <span className="save-msg" style={pwMsg.error ? { color: 'var(--bad)' } : undefined}>{pwMsg.text}</span>
                </div>
              </>
            )}
          </section>

          <MiniTeamCalendar />

          <div className="acp-card">
            <div className="pulse-card__head" style={{ marginBottom: 4 }}>
              <span className="pulse-card__title"><span className="pulse-card__ic">&#128337;</span>Останні дії</span>
            </div>
            <div className="acp-activity-list">
              {activity.length === 0 ? (
                <p className="sec-empty">Активності ще немає.</p>
              ) : (
                activity.map((row) => {
                  const { icon, title } = describeActivity(row);
                  return (
                    <div className="acp-activity-row" key={row.id}>
                      <span className="acp-activity-ic">{icon}</span>
                      <div className="acp-activity-body">
                        <div className="acp-activity-title">{title}</div>
                      </div>
                      <div className="acp-activity-time">{fmtWhen(row.created_at)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="report-section" id="my-requests-section">
        <div className="stitle">Мої заявки</div>
        <div className="req-form">
          <div className="pf">
            <label>Тип</label>
            <select value={reqForm.type} onChange={(e) => setReqForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="vacation">Відпустка</option>
              <option value="sick">Лікарняний</option>
            </select>
          </div>
          <div className="pf"><label>Дата з</label><input type="date" value={reqForm.start} onChange={(e) => setReqForm((f) => ({ ...f, start: e.target.value }))} /></div>
          <div className="pf"><label>Дата по</label><input type="date" value={reqForm.end} onChange={(e) => setReqForm((f) => ({ ...f, end: e.target.value }))} /></div>
          <div className="pf pf-full"><label>Коментар (необов&#39;язково)</label><input type="text" value={reqForm.reason} onChange={(e) => setReqForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Коротко про причину" /></div>
          <button type="button" className="btn btn-p" onClick={handleSubmitRequest} disabled={submitting}>
            {submitting ? '...' : '+ Подати заявку'}
          </button>
        </div>
        <div className="leave-list">
          {!myRequests.length ? (
            <div className="leave-empty">Ви ще не подавали заявок.</div>
          ) : (
            myRequests.map((r) => <LeaveCard key={r.id} row={r} profile={{ first_name: form.first_name, last_name: form.last_name, photo }} onCancel={handleCancel} />)
          )}
        </div>
      </section>

      {isManager && (
        <section className="report-section">
          <div className="stitle">Заявки на розгляд</div>
          <div className="leave-list">
            {!pendingQueue.length ? (
              <div className="leave-empty">Немає заявок на розгляді.</div>
            ) : (
              pendingQueue.map((r) => (
                <LeaveCard
                  key={r.id}
                  row={r}
                  profile={pendingProfiles[r.email]}
                  onApprove={(id) => handleReview(id, 'approved')}
                  onReject={(id) => handleReview(id, 'rejected')}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}
