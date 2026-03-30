import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { clearSession, getSession, isAdminSession, isVoterSession } from '../../store/session';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const isAdmin = location.pathname.startsWith('/admin') && isAdminSession(session);

  let navItems = [{ label: 'ENTRY', path: '/' }];

  if (isAdminSession(session)) {
    navItems = [
      { label: 'ADMIN', path: '/admin' },
      { label: 'CREATE', path: '/admin/new' },
      { label: 'RESULTS', path: '/results' },
    ];
  } else if (isVoterSession(session)) {
    navItems = [
      { label: 'BALLOT', path: '/ballot' },
      { label: 'WAITING', path: '/waiting' },
      { label: 'RESULTS', path: '/results' },
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
    <header className="fixed top-0 w-full z-50 px-12 py-8 flex items-center justify-between pointer-events-none">
      <div className="pointer-events-auto">
        <h1 className={clsx("text-2xl font-muse font-bold tracking-tight", isAdmin ? "text-white" : "text-[var(--primary)]")}>
          The Editorial Ballot
        </h1>
      </div>

      <nav className="pointer-events-auto flex items-center space-x-12">
        <ul className="flex space-x-8">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={clsx(
                    "label-md transition-colors duration-300",
                    isAdmin ? "text-white/50 hover:text-white" : "text-[var(--primary-container)] hover:text-[var(--primary)]",
                    isActive && (isAdmin ? "text-white font-bold" : "text-[var(--primary)] font-bold")
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        {isAdminSession(session) ? (
          <button
            onClick={handleSettingsClick}
            className="px-4 py-2 border border-white/40 text-white uppercase text-[0.65rem] tracking-[0.2em] hover:bg-white hover:text-[var(--primary)] transition-colors duration-300"
            aria-label="Exit admin room"
            title="Exit admin room"
          >
            Exit Admin
          </button>
        ) : null}
        
        <button
          onClick={handleSettingsClick}
          className={clsx("transition-colors duration-300 hover:rotate-90", isAdmin ? "text-white" : "text-[var(--primary)]")}
          aria-label={isAdminSession(session) ? 'Exit admin room' : 'Open entry'}
          title={isAdminSession(session) ? 'Exit admin room' : 'Back to entry'}
        >
          <Settings size={20} />
        </button>
      </nav>
    </header>
  );
}
