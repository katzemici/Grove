import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Finance from './pages/Finance';
import Habits from './pages/Habits';
import Kanban from './pages/Kanban';
import Journal from './pages/Journal';
import { isLocalMode } from './lib/db';
import { installLiquidPress } from './lib/liquid';
import { getCurrency, subscribeCurrency } from './lib/currency';
import Icon, { type IconName } from './components/Icon';
import Logo from './components/Logo';
import Login from './pages/Login';
import { LOGIN_PATH, REGISTER_PATH } from './lib/routes';
import ProfileModal from './components/ProfileModal';
import { session, useSession } from './lib/session';
import { DEFAULT_AVATAR } from './lib/images';
import { Loading } from './components/states';
import type { Profile } from './lib/auth';

const links: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: 'home', end: true },
  { to: '/finance', label: 'Finance', icon: 'wallet' },
  { to: '/habits', label: 'Habits', icon: 'sprout' },
  { to: '/kanban', label: 'Kanban', icon: 'board' },
  { to: '/journal', label: 'Journal', icon: 'book' },
];

const COLLAPSE_KEY = 'grove:sidebar-collapsed';

export default function App() {
  const state = useSession();
  const { pathname } = useLocation();

  useEffect(() => {
    void session.start();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="auth-loading">
        <Loading label="Opening your grove…" />
      </div>
    );
  }
  if (state.status !== 'signedIn') {
    // Key forces a fresh form when a password-reset link switches the mode.
    return <Login key={state.status} recovery={state.status === 'recovery'} />;
  }
  // Signed in on an auth page: go to the Overview.
  if (pathname === LOGIN_PATH || pathname === REGISTER_PATH) return <Navigate to="/" replace />;
  // Key remounts the workspace per account so no state leaks between users.
  return <Workspace key={state.profile.id} profile={state.profile} />;
}

function Workspace({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const location = useLocation();
  // Re-render every page with the new formatting when the display currency changes.
  const currency = useSyncExternalStore(subscribeCurrency, getCurrency);
  const navRef = useRef<HTMLElement>(null);
  const [blob, setBlob] = useState<{ top: number; height: number; dir: 'up' | 'down' } | null>(null);
  const lastTop = useRef<number | null>(null);

  useEffect(() => installLiquidPress(), []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Liquid indicator behind the active nav link: it stretches toward the new link, then settles.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('.side-link.active');
    if (!nav || !active) return setBlob(null);
    const top = active.offsetTop;
    const dir = lastTop.current !== null && top < lastTop.current ? 'up' : 'down';
    lastTop.current = top;
    setBlob({ top, height: active.offsetHeight, dir });
  }, [location.pathname, collapsed]);

  return (
    <div className={'app-shell' + (collapsed ? ' collapsed' : '')}>
      <div className="garden-bg" aria-hidden>
        <div className="texture" />
        <div className="blob blob-leaf" />
        <div className="blob blob-sky" />
        <div className="blob blob-daisy" />
      </div>

      <aside className={'sidebar' + (open ? ' open' : '')} aria-label="Main navigation">
        <div className="brand">
          <div className="logo" aria-hidden>
            <Logo size={22} />
          </div>
          <div className="brand-text">
            <div className="title">Grove</div>
            <div className="sub">Personal workspace</div>
          </div>
          <button
            className="collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Icon name="panel" size={15} />
          </button>
        </div>

        <div className="side-label">Workspace</div>
        <nav className="side-nav" ref={navRef}>
          {blob && (
            <span
              className={'side-blob ' + blob.dir}
              style={{ transform: `translateY(${blob.top}px)`, height: blob.height }}
              aria-hidden
            />
          )}
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => 'side-link' + (isActive ? ' active' : '')}
              title={collapsed ? l.label : undefined}
            >
              <span className="ic" aria-hidden>
                <Icon name={l.icon} size={16} />
              </span>
              <span className="side-text">{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="spacer" />

        <button
          type="button"
          className="side-foot"
          onClick={() => setProfileOpen(true)}
          aria-label="Open your profile"
          title={collapsed ? profile.display_name : undefined}
        >
          <div
            className="avatar"
            aria-hidden
            style={{ backgroundImage: `url("${profile.avatar_url ?? DEFAULT_AVATAR}")` }}
          />
          <div className="side-text">
            <div className="who">{profile.display_name || profile.email}</div>
            <div className="mode">{isLocalMode ? 'Local workspace' : 'Cloud synced'}</div>
          </div>
        </button>
      </aside>

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="content">
        {isLocalMode && (
          <div className="local-banner">
            Running in local mode. Data is saved in this browser. Add Supabase keys to
            <code> .env </code> to sync to the cloud.
          </div>
        )}

        <button className="menu-btn" onClick={() => setOpen(true)}>
          <Icon name="menu" /> <span>Menu</span>
        </button>

        <div className="route-view" key={location.pathname + ':' + currency}>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
