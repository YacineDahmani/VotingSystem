import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { clearSession, getSession, getVoterPhase, isAdminSession, isVoterSession } from '../../store/session';
import { useTheme } from '../ui/ThemeContext';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const { theme, setTheme } = useTheme();
  const phase = getVoterPhase(session);
  const hasVoted = !!session?.hasVoted;

  let navItems = [];

  if (isAdminSession(session)) {
    navItems = [
      { label: 'ADMIN', path: '/admin', disabled: false },
      { label: 'RESULTS', path: '/results', disabled: true },
    ];
  } else if (isVoterSession(session)) {
    navItems = [
      { label: 'ENTRY', path: '/', disabled: true },
      { label: 'BALLOT', path: '/ballot', disabled: hasVoted || phase === 'results' },
      { label: 'WAITING', path: '/waiting', disabled: !hasVoted || phase === 'results' },
      { label: 'RESULTS', path: '/results', disabled: phase !== 'results' },
    ];
  } else {
    navItems = [
      { label: 'ENTRY', path: '/', disabled: false },
      { label: 'WAITING', path: '/waiting', disabled: true },
      { label: 'ADMIN', path: '/admin', disabled: true },
      { label: 'RESULTS', path: '/results', disabled: true },
    ];
  }

  const handleSettingsClick = () => {
    if (isAdminSession(session)) {
      clearSession();
      navigate('/');
      return;
    }

    navigate('/');
  };

  return (
    <header
      className={clsx(
        "fixed top-0 w-full z-50 px-6 md:px-12 py-4 flex items-center justify-between pointer-events-none transition-colors duration-300 overflow-hidden",
        "bg-[var(--surface)]/80 backdrop-blur-xl border-b border-[var(--on-surface)]/10 shadow-sm"
      )}
    >
      {/* Glare Effect Overlay */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-100%] left-[15%] w-[150px] h-[300%] bg-gradient-to-r from-transparent via-[var(--on-surface)]/10 to-transparent blur-[20px] rotate-[35deg] transform-gpu" />
        <div className="absolute top-[-100%] left-[30%] w-[60px] h-[300%] bg-gradient-to-r from-transparent via-[var(--on-surface)]/5 to-transparent blur-[12px] rotate-[35deg] transform-gpu" />
      </div>

      <div className="pointer-events-auto flex items-center z-10">
        <h1 className={clsx('text-[1.35rem] font-muse font-bold tracking-tight', 'text-[var(--on-surface)]')}>
          The Editorial Ballot
        </h1>
      </div>

      <nav className="pointer-events-auto absolute left-1/2 -translate-x-1/2 flex items-center gap-8 md:gap-12 z-10">
        {navItems.length ? (
          <ul className="hidden md:flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path} className="flex group">
                  {item.disabled ? (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="This section is locked until its phase is active"
                      className={clsx(
                        'relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2 cursor-not-allowed',
                        isActive
                          ? 'text-[var(--on-surface)] font-bold opacity-100'
                          : 'text-[var(--on-surface)] opacity-40',
                        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                        isActive
                          ? 'after:scale-x-100 after:shadow-[0_0_8px_rgba(255,255,255,0.45)] after:opacity-100'
                          : 'after:scale-x-0 after:opacity-0'
                      )}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      onClick={() => {
                        if (item.path === '/') {
                          clearSession();
                        }
                      }}
                      className={clsx(
                        'relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2',
                        isActive 
                          ? 'text-[var(--on-surface)] font-bold'
                          : 'text-[var(--on-surface)]/60 hover:text-[var(--on-surface)]',
                        'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                        isActive ? 'after:scale-x-100' : 'after:scale-x-0 group-hover:after:scale-x-100'
                      )}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </nav>

      <div className="pointer-events-auto flex items-center justify-end w-40 gap-4 z-10">
        {isAdminSession(session) ? (
          <button
            onClick={handleSettingsClick}
            className="px-4 py-2 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-[0.65rem] tracking-[0.2em] hover:bg-[var(--on-surface)] hover:text-[var(--surface)] transition-all duration-300"
            aria-label="Exit admin room"
            title="Exit admin room"
          >
            Exit Admin
          </button>
        ) : (
          <div className="w-6 h-6"></div>
        )}
        <button 
          onClick={() => setTheme(theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark')) ? 'light' : 'dark')}
          className={clsx(
            "p-2 transition-all duration-300",
            "border border-[var(--on-surface)]/10 hover:border-[var(--on-surface)]/40 text-[var(--on-surface)]/70 hover:text-[var(--on-surface)]"
          )}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark')) ? (
            <Sun size={18} strokeWidth={1.5} />
          ) : (
            <Moon size={18} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </header>
  );
}
