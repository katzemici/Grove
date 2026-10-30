import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import LiquidHero from '../components/LiquidHero';
import { installLiquidPress, prefersReducedMotion } from '../lib/liquid';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo';
import Icon from '../components/Icon';
import { AppleMark, FacebookMark, GoogleMark } from '../components/BrandMarks';
import { validateEmail, validateName, validatePassword, type OAuthProvider } from '../lib/auth';
import { session } from '../lib/session';

type Mode = 'login' | 'signup' | 'forgot' | 'recovery';

const TITLES: Record<Mode, string> = {
  login: 'Login',
  signup: 'Create account',
  forgot: 'Reset password',
  recovery: 'New password',
};

const SUBTITLES: Record<Mode, string> = {
  login: 'Welcome back to your grove.',
  signup: 'A quiet corner for your money, habits and tasks.',
  forgot: "Enter your email and we'll send you a reset link.",
  recovery: 'Choose a new password for your account.',
};

const PROVIDERS: { id: OAuthProvider; label: string; mark: ReactNode }[] = [
  { id: 'google', label: 'Continue with Google', mark: <GoogleMark /> },
  { id: 'apple', label: 'Continue with Apple', mark: <AppleMark /> },
  { id: 'facebook', label: 'Continue with Facebook', mark: <FacebookMark /> },
];

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

import { LOGIN_PATH, REGISTER_PATH } from '../lib/routes';

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/** Card halves swap sides with a View Transition where supported and motion is welcome. */
function animateSwap(update: () => void) {
  const doc = document as ViewTransitionDocument;
  const wide = window.matchMedia?.('(min-width: 861px)').matches ?? false;
  if (doc.startViewTransition && wide && !prefersReducedMotion()) {
    doc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

export default function Login({ recovery = false }: { recovery?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(
    recovery ? 'recovery' : location.pathname === REGISTER_PATH ? 'signup' : 'login',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const local = session.kind === 'local';

  // Same liquid press drops as the workspace buttons.
  useEffect(() => installLiquidPress(), []);

  type Message = { tone: 'ok' | 'error'; text: string } | null;

  function applyMode(next: Mode, note: Message = null) {
    setMode(next);
    setErrors({});
    setMessage(note);
    setPassword('');
  }

  /** Change mode; login ⇄ register also changes the URL and plays the swap. */
  function switchMode(next: Mode, note: Message = null) {
    const crossing = (mode === 'signup') !== (next === 'signup');
    if (!crossing) return applyMode(next, note);
    animateSwap(() => {
      applyMode(next, note);
      const path = next === 'signup' ? REGISTER_PATH : LOGIN_PATH;
      if (location.pathname !== path) navigate(path);
    });
  }

  // Browser back/forward between /login and /register.
  useEffect(() => {
    if (mode === 'recovery') return;
    const wantsRegister = location.pathname === REGISTER_PATH;
    if (wantsRegister !== (mode === 'signup')) {
      animateSwap(() => applyMode(wantsRegister ? 'signup' : 'login'));
    }
    // Only react to URL changes; mode changes made here already update the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function validate(): boolean {
    const next: Errors = {};
    if (mode === 'signup') next.name = validateName(name) ?? undefined;
    if (mode !== 'recovery') next.email = validateEmail(email) ?? undefined;
    if (mode === 'signup' || mode === 'recovery') next.password = validatePassword(password) ?? undefined;
    if (mode === 'login' && !password) next.password = 'Enter your password.';
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === 'login') await session.signIn(email, password);
      else if (mode === 'signup') {
        const needsConfirmation = await session.signUp(name, email, password);
        if (needsConfirmation) {
          switchMode('login', {
            tone: 'ok',
            text: `Check ${email.trim()} for a confirmation link, then log in.`,
          });
        }
      } else if (mode === 'forgot') {
        await session.requestPasswordReset(email);
        setMessage({ tone: 'ok', text: 'If that email has an account, a reset link is on its way.' });
      } else {
        await session.finishRecovery(password);
      }
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message || 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: OAuthProvider) {
    setMessage(null);
    try {
      await session.signInWithProvider(provider);
    } catch (err) {
      setMessage({ tone: 'error', text: (err as Error).message });
    }
  }

  const submitLabel = {
    login: busy ? 'Logging in…' : 'Log In',
    signup: busy ? 'Creating…' : 'Create account',
    forgot: busy ? 'Sending…' : 'Send reset link',
    recovery: busy ? 'Saving…' : 'Save password',
  }[mode];

  return (
    <div className="auth-page">
      <div className={'auth-card' + (mode === 'signup' ? ' is-register' : '')}>
        {/* Illustration with the brand on top (left on login, right on register) */}
        <div className="auth-hero">
          <LiquidHero showRegister={mode === 'signup'} />
          <div className="auth-brand">
            <span className="logo" aria-hidden>
              <Logo size={22} />
            </span>
            <span className="auth-brand-text">Grove</span>
          </div>
        </div>

        {/* Right: the form */}
        <section className="auth-panel">
          <PanelDecor />
          <div className="auth-form-wrap" key={mode}>
            <h1 className="auth-title">{TITLES[mode]}</h1>
            <p className="auth-sub">{SUBTITLES[mode]}</p>

            <form className="auth-form" onSubmit={submit} noValidate>
              {mode === 'signup' && (
                <Field id="auth-name" label="Name" error={errors.name} icon="user">
                  <input
                    id="auth-name"
                    className={'auth-input' + (errors.name ? ' invalid' : '')}
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-invalid={!!errors.name}
                    aria-describedby={errors.name ? 'auth-name-err' : undefined}
                  />
                </Field>
              )}

              {mode !== 'recovery' && (
                <Field id="auth-email" label="Email" error={errors.email} icon="mail">
                  <input
                    id="auth-email"
                    type="email"
                    className={'auth-input' + (errors.email ? ' invalid' : '')}
                    autoComplete="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? 'auth-email-err' : undefined}
                  />
                </Field>
              )}

              {mode !== 'forgot' && (
                <Field
                  id="auth-password"
                  label={mode === 'recovery' ? 'New password' : 'Password'}
                  error={errors.password}
                  trailing={
                    <button
                      type="button"
                      className="auth-eye"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                    >
                      <Icon name={showPassword ? 'eye' : 'eyeOff'} size={18} />
                    </button>
                  }
                >
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className={'auth-input' + (errors.password ? ' invalid' : '')}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? '••••••••' : 'At least 8 characters'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? 'auth-password-err' : undefined}
                  />
                </Field>
              )}

              {mode === 'login' && (
                <button type="button" className="auth-link auth-forgot" onClick={() => switchMode('forgot')}>
                  Forgot Password?
                </button>
              )}

              {message && (
                <div className={'auth-message ' + message.tone} role={message.tone === 'error' ? 'alert' : 'status'}>
                  {message.text}
                </div>
              )}

              <button type="submit" className="auth-submit liquid" disabled={busy}>
                {submitLabel}
              </button>
            </form>

            {(mode === 'login' || mode === 'signup') && (
              <>
                <div className="auth-divider">
                  <span>Or</span>
                </div>
                <p className="auth-switch">
                  {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                  <button
                    type="button"
                    className="auth-link strong"
                    onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                  >
                    {mode === 'login' ? 'Sign up' : 'Log in'}
                  </button>
                </p>
                <div className="auth-socials">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="auth-social liquid"
                      onClick={() => social(p.id)}
                      disabled={local}
                      title={local ? 'Available once the app is connected to Supabase' : undefined}
                    >
                      {p.mark}
                      <span>{p.label}</span>
                    </button>
                  ))}
                </div>
                {local && (
                  <p className="auth-note">
                    Local mode: accounts are saved in this browser only. Social sign-in needs Supabase.
                  </p>
                )}
              </>
            )}

            {mode === 'forgot' && (
              <p className="auth-switch">
                Remembered it?{' '}
                <button type="button" className="auth-link strong" onClick={() => switchMode('login')}>
                  Back to login
                </button>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  icon,
  trailing,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  icon?: 'mail' | 'user';
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        {children}
        <span className="auth-trailing">
          {trailing ?? (icon && <Icon name={icon} size={18} />)}
        </span>
      </div>
      {error && (
        <span id={id + '-err'} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}

function DaisyHead({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cy={-r} rx={r * 0.42} ry={r} fill="#fffdf6" stroke="#e4e9d6" strokeWidth="0.6" transform={`rotate(${i * 45})`} />
      ))}
      <circle r={r * 0.5} fill="#f7c948" />
    </g>
  );
}

/** Leaf sprigs and daisies tucked into the form panel's corners, like the reference's flowers. */
function PanelDecor() {
  return (
    <>
      <svg className="auth-decor tr" viewBox="0 0 110 170" aria-hidden="true">
        <path d="M110 40 C 70 60 50 100 46 150" stroke="#65744d" strokeWidth="2.5" fill="none" />
        <path d="M62 82 C 30 70 10 84 6 104 C 28 110 50 102 62 82 Z" fill="#8f9b6d" />
        <path d="M52 118 C 82 112 102 128 104 150 C 80 152 60 140 52 118 Z" fill="#b9d27a" />
        <path d="M94 52 C 80 26 88 8 110 0 L 110 46 Z" fill="#6faf5b" />
        <DaisyHead x={40} y={152} r={7} />
      </svg>
      <svg className="auth-decor bl" viewBox="0 0 110 130" aria-hidden="true">
        <path d="M0 130 C 30 110 50 80 58 40" stroke="#65744d" strokeWidth="2.5" fill="none" />
        <path d="M48 80 C 78 72 98 86 100 108 C 76 110 56 100 48 80 Z" fill="#8f9b6d" />
        <path d="M54 50 C 30 34 10 40 2 60 C 22 72 44 68 54 50 Z" fill="#b9d27a" />
        <DaisyHead x={60} y={36} r={6} />
      </svg>
      <svg className="auth-decor br" viewBox="0 0 90 90" aria-hidden="true">
        <path d="M90 90 C 70 60 42 50 10 54 C 30 70 58 86 90 90 Z" fill="#6faf5b" opacity="0.8" />
        <path d="M90 50 C 74 34 76 16 90 2 Z" fill="#b9d27a" />
        <DaisyHead x={40} y={40} r={6} />
      </svg>
    </>
  );
}
