import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { clearSession, getSession, getVoterPhase, isAdminSession, isVoterSession } from '../../store/session';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const isAdmin = location.pathname.startsWith('/admin') && isAdminSession(session);
  const isVoter = isVoterSession(session);
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
      { label: 'ENTRY', path: '/', disabled: false },
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
        "fixed top-0 w-full z-50 px-6 md:px-12 py-5 flex items-center justify-between pointer-events-none transition-colors duration-300",
        "bg-white/90 backdrop-blur-md text-[var(--primary)] border-b border-black/5 shadow-sm"
      )}
    >
      <div className="pointer-events-auto flex items-center">
        {isVoter ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            className={clsx(
              'text-left rounded-sm transition-colors',
              'hover:text-black/70'
            )}
            aria-label="Return to home"
            title="Return to home"
          >
            <h1 className={clsx('text-[1.35rem] font-muse font-bold tracking-tight', 'text-black')}>
              The Editorial Ballot
            </h1>
          </button>
        ) : (
          <h1 className={clsx('text-[1.35rem] font-muse font-bold tracking-tight', 'text-black')}>
            The Editorial Ballot
          </h1>
        )}
      </div>

      <nav className="pointer-events-auto absolute left-1/2 -translate-x-1/2 flex items-center gap-8 md:gap-12">
        {navItems.length ? (
          <ul className="hidden md:flex items-center gap-10">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path} className="flex">
                  {item.disabled ? (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="This section is locked until its phase is active"
                      className={clsx(
                        'flex uppercase text-[0.65rem] tracking-[0.2em] transition-colors duration-300 cursor-not-allowed opacity-40',
                        'text-gray-400'
                      )}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      className={clsx(
                        'flex uppercase text-[0.65rem] tracking-[0.2em] transition-all duration-300',
                        'text-gray-500 hover:text-black',
                        isActive && 'text-black font-bold'
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

      <div className="pointer-events-auto flex items-center justify-end w-32">
        {isAdminSession(session) ? (
          <button
            onClick={handleSettingsClick}
            className="px-4 py-2 border border-black/40 text-[var(--primary)] uppercase text-[0.65rem] tracking-[0.2em] hover:bg-[var(--primary)] hover:text-white transition-colors duration-300"
            aria-label="Exit admin room"
            title="Exit admin room"
          >
            Exit Admin
          </button>
        ) : (
          /* Removed settings icon logic as per requirements */
          <div className="w-6 h-6"></div>
        )}
      </div>
    </header>
  );
}
