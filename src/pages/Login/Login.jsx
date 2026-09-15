import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { WordmarkWhite, MonoKnot } from '../../components/Logo/Logo';
import './Login.css';

const ALLOWED_DOMAIN = '@monarchi.agency';
// The account this CRM was originally set up under, kept working even
// though it predates the @monarchi.agency domain restriction — everyone
// else needs a corporate email. Real enforcement is server-side (a Postgres
// trigger on auth.users); this is just an instant, no-request UX check.
const EXCEPTION_EMAILS = ['monarchi.partnership@gmail.com'];

function isAllowedEmail(email) {
  const lower = email.toLowerCase();
  return lower.endsWith(ALLOWED_DOMAIN) || EXCEPTION_EMAILS.includes(lower);
}

export default function Login() {
  const [method, setMethod] = useState('otp'); // 'otp' | 'password'
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errEmail, setErrEmail] = useState('');
  const [errCode, setErrCode] = useState('');
  const codeInputRef = useRef(null);

  const [pwEmail, setPwEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pwSending, setPwSending] = useState(false);
  const [errPw, setErrPw] = useState('');

  async function sendCode() {
    setErrEmail('');
    const trimmed = email.trim();
    if (!trimmed) { setErrEmail('Введіть вашу робочу пошту.'); return; }
    if (!isAllowedEmail(trimmed)) {
      setErrEmail('Вхід дозволено лише для корпоративної пошти @monarchi.agency.');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: true } });
      if (error) throw error;
      setEmail(trimmed);
      setCode('');
      setErrCode('');
      setStep('code');
      setTimeout(() => codeInputRef.current?.focus(), 0);
    } catch (e) {
      setErrEmail('Не вдалося надіслати код: ' + (e.message || 'спробуйте ще раз.'));
    } finally {
      setSending(false);
    }
  }

  async function signInWithPassword() {
    setErrPw('');
    const trimmed = pwEmail.trim();
    if (!trimmed) { setErrPw('Введіть вашу робочу пошту.'); return; }
    if (!isAllowedEmail(trimmed)) {
      setErrPw('Вхід дозволено лише для корпоративної пошти @monarchi.agency.');
      return;
    }
    if (!password) { setErrPw('Введіть пароль.'); return; }
    setPwSending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
      if (error) throw error;
      // AuthContext picks up the new session via onAuthStateChange.
    } catch {
      setErrPw('Невірна пошта або пароль. Якщо ще не встановлювали пароль — увійдіть кодом.');
    } finally {
      setPwSending(false);
    }
  }

  async function verifyCode() {
    setErrCode('');
    const trimmed = code.trim();
    if (!trimmed) { setErrCode('Введіть код із листа.'); return; }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: trimmed, type: 'email' });
      if (error) throw error;
      // AuthContext picks up the new session via onAuthStateChange.
    } catch {
      setErrCode('Невірний або прострочений код. Спробуйте ще раз.');
    } finally {
      setVerifying(false);
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
            <h2>Внутрішня CRM для звітності та інструментів команди.</h2>
            <p>
              Тижневі, місячні та річні звіти, порівняння періодів і робочі студії &mdash; в одному місці,
              доступному лише команді.
            </p>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          {method === 'password' ? (
            <div>
              <h1>Увійти паролем</h1>
              <p className="sub">Робоча пошта та пароль, які ви встановили в кабінеті.</p>
              <div className="field">
                <label htmlFor="pwLoginEmail">Робоча пошта</label>
                <input
                  id="pwLoginEmail"
                  type="email"
                  placeholder="name@monarchi.agency"
                  required
                  autoComplete="email"
                  value={pwEmail}
                  onChange={(e) => setPwEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signInWithPassword(); } }}
                />
              </div>
              <div className="field">
                <label htmlFor="pwLoginPassword">Пароль</label>
                <input
                  id="pwLoginPassword"
                  type="password"
                  placeholder="Ваш пароль"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); signInWithPassword(); } }}
                />
              </div>
              <button type="button" className="login-btn" disabled={pwSending} onClick={signInWithPassword}>
                {pwSending ? 'Входимо...' : 'Увійти'}
              </button>
              {errPw && <p className="login-note err">{errPw}</p>}
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); setMethod('otp'); setErrPw(''); }}>Увійти кодом натомість</a>
              </p>
              <p className="login-foot">MONARCHI CRM &middot; INTERNAL</p>
            </div>
          ) : step === 'email' ? (
            <div>
              <h1>Увійти в Monarchi CRM</h1>
              <p className="sub">Введіть робочу пошту команди. Ми надішлемо одноразовий код для входу.</p>
              <div className="field">
                <label htmlFor="loginEmail">Робоча пошта</label>
                <input
                  id="loginEmail"
                  type="email"
                  placeholder="name@monarchi.agency"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendCode(); } }}
                />
              </div>
              <button type="button" className="login-btn" disabled={sending} onClick={sendCode}>
                {sending ? 'Надсилаємо...' : 'Надіслати код'}
              </button>
              {errEmail && <p className="login-note err">{errEmail}</p>}
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); setMethod('password'); setErrEmail(''); }}>Увійти паролем натомість</a>
              </p>
              <p className="login-foot">MONARCHI CRM &middot; INTERNAL</p>
            </div>
          ) : (
            <div>
              <h1>Введіть код</h1>
              <p className="sub">Ми надіслали код на <b>{email}</b>.</p>
              <div className="field">
                <label htmlFor="loginCode">Код підтвердження</label>
                <input
                  ref={codeInputRef}
                  id="loginCode"
                  type="text"
                  placeholder="код з листа"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } }}
                />
              </div>
              <button type="button" className="login-btn" disabled={verifying} onClick={verifyCode}>
                {verifying ? 'Перевіряємо...' : 'Увійти'}
              </button>
              {errCode && <p className="login-note err">{errCode}</p>}
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); sendCode(); }}>Надіслати код повторно</a>
                {' · '}
                <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setErrEmail(''); setErrCode(''); }}>
                  Змінити пошту
                </a>
              </p>
              <p className="login-foot">MONARCHI CRM &middot; INTERNAL</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
