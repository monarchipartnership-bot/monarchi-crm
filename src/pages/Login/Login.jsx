import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { LOGIN_ICONS } from './loginAssets';
import { WordmarkWhite, WordmarkDark, MonoKnot } from '../../components/Logo/Logo';
import heroPeople from '../../assets/login/login-people.webp';
import './Login.css';

const FEATURES = [
  { icon: LOGIN_ICONS.deals, title: 'CRM та угоди', sub: 'Клієнти, угоди та воронка продажів.' },
  { icon: LOGIN_ICONS.reports, title: 'Тижневі звіти', sub: 'Усі дані про проєкти в одному місці.' },
  { icon: LOGIN_ICONS.projects, title: 'Проєкти', sub: 'Контроль задач і прогресу команди.' },
  { icon: LOGIN_ICONS.team, title: 'Команда', sub: 'Спільна робота та ресурси студії.' },
  { icon: LOGIN_ICONS.ai, title: 'AI-асистенти', sub: 'Автоматизація рутинних процесів.' },
  { icon: LOGIN_ICONS.compare, title: 'Аналітика', sub: 'Динаміка та прозорість результатів.' },
];

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
      <div className="login-hero">
        <div className="login-hero__bg" aria-hidden="true" />
        <div className="login-hero__watermark-clip" aria-hidden="true">
          <MonoKnot className="login-hero__watermark" />
        </div>

        <div className="login-hero__top">
          <div className="login-hero__kicker-top">Monarchi &middot; Operations</div>
        </div>

        <div className="login-hero__body">
          <h2>Єдина внутрішня платформа Mon&#39;Archi</h2>

          <div className="login-hero__lower">
            <p>
              Керуйте клієнтами та угодами в CRM, ведіть проєкти, працюйте зі звітністю, використовуйте
              AI-асистентів, автоматизації та робочі інструменти - без перемикання між десятками сервісів.
            </p>

            <div className="login-feature-list">
              {FEATURES.map((f) => (
                <div className="login-feature-card" key={f.title}>
                  <span className="login-feature-card__icon" dangerouslySetInnerHTML={{ __html: f.icon }} />
                  <div>
                    <div className="login-feature-card__title">{f.title}</div>
                    <div className="login-feature-card__sub">{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <img className="login-hero__people" src={heroPeople} alt="" aria-hidden="true" />
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-card__logo-row">
            <WordmarkDark className="login-card__logo" />
          </div>

          {method === 'password' ? (
            <div>
              <h1>Увійти паролем</h1>
              <p className="sub">Робоча пошта та пароль, які ви встановили в кабінеті.</p>
              <div className="field">
                <label htmlFor="pwLoginEmail">Робоча пошта</label>
                <div className="field-input-wrap">
                  <span className="field-input-icon" dangerouslySetInnerHTML={{ __html: LOGIN_ICONS.mail }} />
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
                {pwSending ? <span className="login-btn__spinner" /> : null}
                {pwSending ? 'Входимо...' : 'Увійти'}
              </button>
              {errPw && <p className="login-note err">{errPw}</p>}
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); setMethod('otp'); setErrPw(''); }}>Увійти кодом натомість</a>
              </p>
            </div>
          ) : step === 'email' ? (
            <div>
              <h1 className="center">Вхід на платформу</h1>
              <p className="sub center">Введіть робочу пошту команди. Ми надішлемо одноразовий код для входу.</p>
              <div className="field">
                <div className="field-input-wrap">
                  <span className="field-input-icon" dangerouslySetInnerHTML={{ __html: LOGIN_ICONS.mail }} />
                  <input
                    id="loginEmail"
                    type="email"
                    aria-label="Робоча пошта"
                    placeholder="name@monarchi.agency"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendCode(); } }}
                  />
                </div>
              </div>
              <button type="button" className="login-btn" disabled={sending} onClick={sendCode}>
                {sending && <span className="login-btn__spinner" />}
                <span>{sending ? 'Надсилання...' : 'Надіслати код'}</span>
                {!sending && <span className="login-btn__arrow" dangerouslySetInnerHTML={{ __html: LOGIN_ICONS.arrowRight }} />}
              </button>
              {errEmail && <p className="login-note err">{errEmail}</p>}
              <div className="login-divider"><span>або</span></div>
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); setMethod('password'); setErrEmail(''); }}>Увійти паролем натомість</a>
              </p>
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
                {verifying && <span className="login-btn__spinner" />}
                {verifying ? 'Перевірка...' : 'Увійти'}
              </button>
              {errCode && <p className="login-note err">{errCode}</p>}
              <p className="login-note">
                <a href="#" onClick={(e) => { e.preventDefault(); sendCode(); }}>Надіслати код повторно</a>
                {' · '}
                <a href="#" onClick={(e) => { e.preventDefault(); setStep('email'); setErrEmail(''); setErrCode(''); }}>
                  Змінити пошту
                </a>
              </p>
            </div>
          )}
        </div>

        <div className="login-right__foot">
          <div className="login-right__foot-title">Лише для внутрішньої команди</div>
          <div className="login-right__foot-sub">MONARCHI CRM &middot; INTERNAL</div>
        </div>
      </div>
    </div>
  );
}
