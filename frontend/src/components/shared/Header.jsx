import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { LogOut, Moon, Sun } from 'lucide-react';
import { clearSession, getVoterPhase, isAdminSession, isVoterSession, useSession } from '../../store/session';
import { useTheme } from '../ui/ThemeContext';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const { theme, setTheme } = useTheme();

  const isAdmin = isAdminSession(session);
  const isVoter = isVoterSession(session);
  const phase = getVoterPhase(session);
  const hasVoted = !!session?.hasVoted;

  const handleExit = () => {
    clearSession();
    navigate('/');
  };

  const renderNavItems = () => {
    if (isAdmin) {
      const adminNav = [
        { label: 'DASHBOARD', path: '/admin', active: location.pathname === '/admin' },
        {
          label: 'CREATE ELECTION',
          path: '/admin/create',
          active: location.pathname === '/admin/create' || location.pathname === '/admin/new',
        },
        { label: 'RESULTS & AUDIT', path: '/results', active: location.pathname === '/results' },
      ];

      return (
        <ul className="hidden md:flex items-center gap-8">
          {adminNav.map((item) => (
            <li key={item.path} className="flex group">
              <Link
                to={item.path}
                className={clsx(
                  'relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2',
                  item.active
                    ? 'text-[var(--on-surface)] font-bold'
                    : 'text-[var(--on-surface)]/60 hover:text-[var(--on-surface)]',
                  'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                  item.active ? 'after:scale-x-100' : 'after:scale-x-0 group-hover:after:scale-x-100'
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      );
    }

    if (isVoter) {
      const voterNav = [
        {
          label: 'BALLOT',
          path: '/ballot',
          disabled: hasVoted || phase === 'results',
          active: location.pathname === '/ballot',
          title: hasVoted ? 'Ballot already submitted' : phase === 'results' ? 'Voting closed' : 'Cast your vote',
        },
        {
          label: 'WAITING ROOM',
          path: '/waiting',
          disabled: !hasVoted && phase !== 'waiting',
          active: location.pathname === '/waiting',
          title: !hasVoted ? 'Submit ballot to enter waiting room' : 'Live waiting room',
        },
        {
          label: 'RESULTS',
          path: '/results',
          disabled: phase !== 'results',
          active: location.pathname === '/results',
          title: phase !== 'results' ? 'Results available once voting concludes' : 'Certified election results',
        },
      ];

      return (
        <ul className="hidden md:flex items-center gap-8">
          {voterNav.map((item) => (
            <li key={item.path} className="flex group">
              {item.disabled ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={item.title}
                  className={clsx(
                    'relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2 cursor-not-allowed',
                    item.active
                      ? 'text-[var(--on-surface)] font-bold opacity-100'
                      : 'text-[var(--on-surface)] opacity-35',
                    'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                    item.active ? 'after:scale-x-100 opacity-100' : 'after:scale-x-0 opacity-0'
                  )}
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  to={item.path}
                  title={item.title}
                  className={clsx(
                    'relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2',
                    item.active
                      ? 'text-[var(--on-surface)] font-bold'
                      : 'text-[var(--on-surface)]/60 hover:text-[var(--on-surface)]',
                    'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                    item.active ? 'after:scale-x-100' : 'after:scale-x-0 group-hover:after:scale-x-100'
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      );
    }

    // Unauthenticated / Guest View
    if (location.pathname === '/results') {
      return (
        <ul className="hidden md:flex items-center gap-8">
          <li className="flex group">
            <Link
              to="/"
              className="relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2 text-[var(--on-surface)]/60 hover:text-[var(--on-surface)] after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left after:scale-x-0 group-hover:after:scale-x-100"
            >
              SIGN IN
            </Link>
          </li>
          <li className="flex group">
            <Link
              to="/results"
              className="relative flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300 py-2 text-[var(--on-surface)] font-bold after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-px after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left after:scale-x-100"
            >
              RESULTS
            </Link>
          </li>
        </ul>
      );
    }

    return null;
  };

  const getHomeLink = () => {
    if (isAdmin) return '/admin';
    if (isVoter) {
      if (phase === 'results') return '/results';
      if (hasVoted || phase === 'waiting') return '/waiting';
      return '/ballot';
    }
    return '/';
  };

  return (
    <header
      className={clsx(
        'fixed top-0 w-full z-50 px-6 md:px-12 py-4 flex items-center justify-between pointer-events-none transition-colors duration-300',
        'bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--on-surface)]/10 shadow-sm'
      )}
    >

      {/* Brand & Mode Tag */}
      <div className="pointer-events-auto flex items-center gap-3 z-10">
        <Link to={getHomeLink()} className="flex items-center gap-2 group">
          <h1 className={clsx('text-[1.35rem] font-muse font-bold tracking-tight transition-opacity group-hover:opacity-85', 'text-[var(--on-surface)]')}>
            Voting System
          </h1>
        </Link>
        {isAdmin && (
          <span className="px-2 py-0.5 text-[0.52rem] uppercase tracking-[0.2em] font-bold bg-[var(--primary)] text-[var(--on-primary)] shadow-sm">
            ADMIN
          </span>
        )}
        {isVoter && (
          <span className="px-2 py-0.5 text-[0.52rem] uppercase tracking-[0.2em] font-bold border border-[var(--on-surface)]/20 text-[var(--on-surface)]">
            VOTER
          </span>
        )}
      </div>

      {/* Isolated Center Navigation */}
      <nav className="pointer-events-auto absolute left-1/2 -translate-x-1/2 flex items-center gap-8 md:gap-12 z-10">
        {renderNavItems()}
      </nav>

      {/* Right Controls */}
      <div className="pointer-events-auto flex items-center justify-end gap-3 md:gap-4 z-10">
        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExit}
              className="px-3.5 py-1.5 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-[0.62rem] tracking-[0.18em] font-bold hover:bg-[var(--on-surface)] hover:text-[var(--surface)] transition-all duration-300 flex items-center gap-1.5"
              aria-label="Exit admin session"
              title="Exit admin session"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          </div>
        )}

        {isVoter && (
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline-block text-[0.6rem] uppercase tracking-[0.16em] text-[var(--on-surface)] opacity-60 font-mono">
              {session?.voterName || 'Citizen'}
            </span>
            <button
              type="button"
              onClick={handleExit}
              className="px-3.5 py-1.5 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-[0.62rem] tracking-[0.18em] font-bold hover:bg-[var(--on-surface)] hover:text-[var(--surface)] transition-all duration-300 flex items-center gap-1.5"
              aria-label="Exit voter session"
              title="Exit voter session"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          </div>
        )}

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={() =>
            setTheme(
              theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark'))
                ? 'light'
                : 'dark'
            )
          }
          className={clsx(
            'p-2 transition-all duration-300',
            'border border-[var(--on-surface)]/10 hover:border-[var(--on-surface)]/40 text-[var(--on-surface)]/70 hover:text-[var(--on-surface)]'
          )}
          aria-label="Toggle Theme"
          title="Toggle Theme"
        >
          {theme === 'dark' || (theme === 'system' && document.documentElement.classList.contains('dark')) ? (
            <Sun size={17} strokeWidth={1.5} />
          ) : (
            <Moon size={17} strokeWidth={1.5} />
          )}
        </button>
      </div>
    </header>
  );
}
