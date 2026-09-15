import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LeaveCard from '../../components/Team/LeaveCard';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import {
  fetchProfile, saveProfile, fetchMyLeaveRequests, submitLeaveRequest,
  cancelLeaveRequest, fetchPendingQueue, reviewLeaveRequest, markPasswordSet,
} from '../../lib/api/profile';
import { fetchProfilesByEmails } from '../../lib/api/leaveRequests';
import '../../styles/reportPage.css';
import '../../styles/teamPage.css';
import '../../styles/accountPage.css';

function initials(name, email) {
  if (name?.trim()) return name.trim()[0].toUpperCase();
  return (email || '?')[0].toUpperCase();
}

export default function Account() {
  const navigate = useNavigate();
  const { email } = useAuth();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({ first_name: '', last_name: '', position: '', phone: '', role: 'member' });
  const [photo, setPhoto] = useState(null);
  const [saveMsg, setSaveMsg] = useState({ text: '', error: false });
  const [saving, setSaving] = useState(false);

  const [myRequests, setMyRequests] = useState([]);
  const [reqForm, setReqForm] = useState({ type: 'vacation', start: '', end: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  const [isManager, setIsManager] = useState(false);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [pendingProfiles, setPendingProfiles] = useState({});

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState({ text: '', error: false });

  useEffect(() => {
    if (!email) return;
    (async () => {
      try {
        const p = await fetchProfile(email);
        setForm({
          first_name: p?.first_name || '',
          last_name: p?.last_name || '',
          position: p?.position || '',
          phone: p?.phone || '',
          role: p?.role || 'member',
        });
        setPhoto(p?.photo || null);
        setIsManager(p?.role === 'ops_manager');
      } catch (e) {
        console.warn('loadProfile failed', e);
      }
    })();
    reloadMyRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (isManager) reloadPendingQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

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
    } catch (e) {
      console.warn('saveProfile failed', e);
      setSaveMsg({ text: 'Помилка збереження', error: true });
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="report-page">
      <div className="page-actions">
        <button type="button" className="btn" onClick={() => navigate(-1)}>&#8592; Back</button>
      </div>

      <section className="rpt-hero">
        <h1>Мій кабінет</h1>
        <p className="sub">Профіль, календар відпусток команди та ваші заявки.</p>
      </section>

      <section className="report-section">
        <div className="stitle">Мій профіль</div>
        <div className="chbox-unified">
          <div className="profile-box">
            <div className="avatar-upload">
              <div className="avatar-preview" onClick={() => fileInputRef.current?.click()}>
                {photo ? <img src={photo} alt="" /> : initials(form.first_name, email)}
              </div>
              <button type="button" className="mini" onClick={() => fileInputRef.current?.click()}>Змінити фото</button>
              {photo && <button type="button" className="mini" onClick={() => setPhoto(null)}>Прибрати</button>}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
            </div>
            <div className="profile-fields">
              <div className="pf"><label>Ім&#39;я</label><input type="text" value={form.first_name} onChange={(e) => setField('first_name', e.target.value)} placeholder="Ім'я" /></div>
              <div className="pf"><label>Прізвище</label><input type="text" value={form.last_name} onChange={(e) => setField('last_name', e.target.value)} placeholder="Прізвище" /></div>
              <div className="pf"><label>Посада</label><input type="text" value={form.position} onChange={(e) => setField('position', e.target.value)} placeholder="напр. Sales Manager" /></div>
              <div className="pf"><label>Телефон</label><input type="text" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="+380..." /></div>
              <div className="pf"><label>Email</label><input type="text" value={email || ''} readOnly /></div>
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
              <div className="profile-actions">
                <button type="button" className="btn btn-p" onClick={handleSaveProfile} disabled={saving}>
                  {saving ? '...' : <>&#10003; Зберегти профіль</>}
                </button>
                <span className="save-msg" style={saveMsg.error ? { color: 'var(--bad)' } : undefined}>{saveMsg.text}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="stitle">Пароль</div>
        <div className="chbox-unified">
          <div className="profile-fields">
            <div className="pf"><label>Новий пароль</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Щонайменше 8 символів" autoComplete="new-password" /></div>
            <div className="pf"><label>Повторіть пароль</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Ще раз той самий пароль" autoComplete="new-password" /></div>
            <div className="profile-actions">
              <button type="button" className="btn btn-p" onClick={handleChangePassword} disabled={pwSaving}>
                {pwSaving ? '...' : <>&#10003; Оновити пароль</>}
              </button>
              <span className="save-msg" style={pwMsg.error ? { color: 'var(--bad)' } : undefined}>{pwMsg.text}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="report-section">
        <div className="stitle">Календар команди</div>
        <Link className="chbox-unified account-link-card" to="/team/calendar">
          <div className="account-link-row">
            <div className="account-link-ic">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M7 14l2.5 2.5L12 13l3 4" /></svg>
            </div>
            <div>
              <div className="account-link-title">Переглянути спільний календар команди</div>
              <div className="account-link-sub">Хто з команди у відпустці чи на лікарняному — доступно всім з головного меню</div>
            </div>
          </div>
        </Link>
      </section>

      <section className="report-section">
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
