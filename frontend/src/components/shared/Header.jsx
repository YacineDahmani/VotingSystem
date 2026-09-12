import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { clearSession, getVoterPhase, isAdminSession, isVoterSession, useSession } from '../../store/session';
import { useTheme } from '../ui/ThemeContext';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isAdmin = isAdminSession(session);
  const isVoter = isVoterSession(session);
  const phase = getVoterPhase(session);
  const hasVoted = !!session?.hasVoted;

  const handleExit = () => {
    setMobileMenuOpen(false);
    clearSession();
    navigate('/');
  };

  const navLinks = useMemo(() => {
    if (isAdmin) {
      return [
        { label: 'DASHBOARD', path: '/admin', active: location.pathname === '/admin' },
        {
          label: 'CREATE ELECTION',
          path: '/admin/create',
          active: location.pathname === '/admin/create' || location.pathname === '/admin/new',
        },
        {
          label: 'OFFICERS & ROLES',
          path: '/admin/officers',
          active: location.pathname === '/admin/officers',
        },
        { label: 'RESULTS & AUDIT', path: '/results', active: location.pathname === '/results' },
      ];
    }

    if (isVoter) {
      return [
        {
          label: 'vote',
          path: '/vote',
          disabled: hasVoted || phase === 'results',
          active: location.pathname === '/vote',
          title: hasVoted ? 'vote already submitted' : phase === 'results' ? 'Voting closed' : 'Cast your vote',
        },
        {
          label: 'WAITING ROOM',
          path: '/waiting',
          disabled: !hasVoted && phase !== 'waiting',
          active: location.pathname === '/waiting',
          title: !hasVoted ? 'Submit vote to enter waiting room' : 'Live waiting room',
        },
        {
          label: 'RESULTS',
          path: '/results',
          disabled: phase !== 'results',
          active: location.pathname === '/results',
          title: phase !== 'results' ? 'Results available once voting concludes' : 'Certified election results',
        },
      ];
    }

    if (location.pathname === '/results') {
      return [
        { label: 'SIGN IN', path: '/', active: false },
        { label: 'RESULTS', path: '/results', active: true },
      ];
    }

    return [];
  }, [isAdmin, isVoter, hasVoted, phase, location.pathname]);

  const getHomeLink = () => {
    if (isAdmin) return '/admin';
    if (isVoter) {
      if (phase === 'results') return '/results';
      if (hasVoted || phase === 'waiting') return '/waiting';
      return '/vote';
    }
    return '/';
  };

  return (
    <header
      className={clsx(
        'fixed top-0 w-full z-50 px-4 sm:px-6 md:px-12 py-3.5 flex items-center justify-between pointer-events-none transition-colors duration-300',
        'bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--on-surface)]/10 shadow-xs'
      )}
    >
      {/* Brand & Mode Tag */}
      <div className="pointer-events-auto flex items-center gap-3 z-10">
        <Link to={getHomeLink()} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2 group">
          <h1 className={clsx('text-xl sm:text-2xl font-muse font-bold tracking-tight transition-opacity group-hover:opacity-85', 'text-[var(--on-surface)]')}>
            Voting System
          </h1>
        </Link>
        {isAdmin && (
          <span className="px-2 py-0.5 text-xs uppercase tracking-wider font-bold bg-[var(--primary)] text-[var(--on-primary)] shadow-xs">
            Admin
          </span>
        )}
        {isVoter && (
          <span className="px-2 py-0.5 text-xs uppercase tracking-wider font-bold border border-[var(--on-surface)]/20 text-[var(--on-surface)]">
            Voter
          </span>
        )}
      </div>

      {/* Desktop Navigation */}
      <nav className="pointer-events-auto absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-8 z-10">
        <ul className="flex items-center gap-8">
          {navLinks.map((item) => (
            <li key={item.path} className="flex group">
              {item.disabled ? (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={item.title}
                  className={clsx(
                    'relative flex uppercase text-xs tracking-wider transition-all duration-300 py-2 cursor-not-allowed opacity-35 text-[var(--on-surface)]'
                  )}
                >
                  {item.label}
                </button>
              ) : (
                <Link
                  to={item.path}
                  title={item.title}
                  className={clsx(
                    'relative flex uppercase text-xs tracking-wider transition-all duration-300 py-2',
                    item.active
                      ? 'text-[var(--on-surface)] font-bold'
                      : 'text-[var(--on-surface)]/70 hover:text-[var(--on-surface)]',
                    'after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-0.5 after:bg-[var(--on-surface)] after:transition-transform after:duration-300 after:origin-left',
                    item.active ? 'after:scale-x-100' : 'after:scale-x-0 group-hover:after:scale-x-100'
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Right Controls */}
      <div className="pointer-events-auto flex items-center justify-end gap-2 sm:gap-3 z-10">
        {isAdmin && (
          <div className="hidden sm:flex items-center gap-3">
            <button
              type="button"
              onClick={handleExit}
              className="px-3 py-1.5 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-xs tracking-wider font-bold hover:bg-[var(--on-surface)] hover:text-[var(--surface)] transition-all duration-200 flex items-center gap-1.5"
              aria-label="Exit admin session"
              title="Exit admin session"
            >
              <LogOut size={13} />
              <span>Exit</span>
            </button>
          </div>
        )}

        {isVoter && (
          <div className="hidden sm:flex items-center gap-3">
            <span className="hidden lg:inline-block text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-70 font-mono">
              {session?.voterName || 'Citizen'}
            </span>
            <button
              type="button"
              onClick={handleExit}
              className="px-3 py-1.5 border border-[var(--on-surface)]/20 text-[var(--on-surface)] uppercase text-xs tracking-wider font-bold hover:bg-[var(--on-surface)] hover:text-[var(--surface)] transition-all duration-200 flex items-center gap-1.5"
              aria-label="Exit voter session"
              title="Exit voter session"
            >
              <LogOut size={13} />
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
            'p-2 transition-all duration-200',
            'border border-[var(--on-surface)]/15 hover:border-[var(--on-surface)]/40 text-[var(--on-surface)]/70 hover:text-[var(--on-surface)]'
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

        {/* Mobile Menu Toggle Button */}
        {navLinks.length > 0 && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 border border-[var(--on-surface)]/15 text-[var(--on-surface)] transition-colors"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}
      </div>

      {/* Mobile Drawer Dropdown */}
      {mobileMenuOpen && navLinks.length > 0 && (
        <div className="pointer-events-auto absolute top-full left-0 w-full bg-[var(--surface-container-lowest)] border-b border-[var(--on-surface)]/15 shadow-xl md:hidden p-5 animate-fade-in flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {navLinks.map((item) => (
              <li key={item.path}>
                {item.disabled ? (
                  <span className="block px-3 py-2 text-xs uppercase tracking-wider text-[var(--on-surface)] opacity-35 font-bold">
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={clsx(
                      'block px-3 py-2 text-xs uppercase tracking-wider font-bold transition-colors',
                      item.active
                        ? 'bg-[var(--surface-container)] text-[var(--on-surface)] border-l-2 border-[var(--primary)]'
                        : 'text-[var(--on-surface)]/70 hover:bg-[var(--surface-container-low)]'
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {(isAdmin || isVoter) && (
            <div className="pt-3 border-t border-[var(--on-surface)]/10 flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-mono opacity-60">
                {isAdmin ? 'Admin Mode' : session?.voterName || 'Voter'}
              </span>
              <button
                type="button"
                onClick={handleExit}
                className="px-3 py-1.5 border border-rose-400 text-rose-700 dark:text-rose-400 uppercase text-xs tracking-wider font-bold flex items-center gap-1"
              >
                <LogOut size={12} />
                <span>Exit Session</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
