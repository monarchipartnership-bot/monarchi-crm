import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { markPasswordSet } from '../../lib/api/profile';
import { useAuth } from '../../contexts/AuthContext';
import { WordmarkWhite, MonoKnot } from '../../components/Logo/Logo';
import './Login.css';

const MIN_LENGTH = 8;

export default function SetPassword() {
  const { email, signOut, refreshPasswordSet } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit() {
    setErr('');
    if (password.length < MIN_LENGTH) { setErr(`Пароль має містити щонайменше ${MIN_LENGTH} символів.`); return; }
    if (password !== confirm) { setErr('Паролі не збігаються.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await markPasswordSet(email);
      await refreshPasswordSet();
    } catch (e) {
      setErr('Не вдалося встановити пароль: ' + (e.message || 'спробуйте ще раз.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <MonoKnot className="mono" />
        <div className="login-brand-top">
          <WordmarkWhite className="login-wordmark" />
        </div>
        <div className="login-brand-mid">
          <div className="login-brand-bottom">
            <div className="kicker">Monarchi &middot; Operations</div>
            <h2>Ще один крок — встановіть пароль.</h2>
            <p>
              Це ваш перший вхід. Встановіть пароль, щоб наступного разу заходити швидше —
              кодом на пошту чи паролем, як зручніше.
            </p>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <h1>Встановіть пароль</h1>
          <p className="sub">Акаунт: <b>{email}</b></p>
          <div className="field">
            <label htmlFor="newPassword">Новий пароль</label>
            <input
              id="newPassword"
              type="password"
              placeholder={`Щонайменше ${MIN_LENGTH} символів`}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Повторіть пароль</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Ще раз той самий пароль"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
            />
          </div>
          <button type="button" className="login-btn" disabled={saving} onClick={handleSubmit}>
            {saving ? 'Зберігаємо...' : 'Встановити пароль і продовжити'}
          </button>
          {err && <p className="login-note err">{err}</p>}
          <p className="login-note">
            Передумали? <a href="#" onClick={(e) => { e.preventDefault(); signOut(); }}>Вийти</a>
          </p>
          <p className="login-foot">MONARCHI CRM &middot; INTERNAL</p>
        </div>
      </div>
    </div>
  );
}
