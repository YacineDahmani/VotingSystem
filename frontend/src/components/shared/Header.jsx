import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { clearSession, getSession, isAdminSession, isVoterSession } from '../../store/session';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const isAdmin = location.pathname.startsWith('/admin') && isAdminSession(session);

  let navItems = [{ label: 'ENTRY', path: '/' }];

  if (isAdminSession(session)) {
    navItems = [];
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
    <header
      className={clsx(
        "fixed top-0 w-full z-50 px-4 md:px-10 py-4 md:py-6 flex items-center justify-between pointer-events-none border-b",
        isAdmin
          ? "bg-[rgba(20,42,63,0.86)] backdrop-blur-md border-white/15"
          : "bg-[rgba(249,249,249,0.88)] backdrop-blur-md border-black/5"
      )}
    >
      <div className="pointer-events-auto">
        <h1 className={clsx("text-2xl font-muse font-bold tracking-tight", isAdmin ? "text-white" : "text-[var(--primary)]")}>
          The Editorial Ballot
        </h1>
      </div>

      <nav className="pointer-events-auto flex items-center space-x-6 md:space-x-8">
        {navItems.length ? (
          <ul className="hidden md:flex space-x-8">
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
        ) : null}

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
      </nav>
    </header>
  );
}
