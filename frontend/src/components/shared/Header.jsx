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
    navItems = [];
  } else if (isVoterSession(session)) {
    navItems = [
      { label: 'BALLOT', path: '/ballot', disabled: hasVoted || phase === 'results' },
      { label: 'WAITING', path: '/waiting', disabled: !hasVoted || phase === 'results' },
      { label: 'RESULTS', path: '/results', disabled: phase !== 'results' },
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
        "fixed top-0 w-full z-50 px-4 md:px-8 py-3 md:py-4 flex items-center justify-between pointer-events-none border-b",
        isAdmin
          ? "bg-[rgba(20,42,63,0.86)] backdrop-blur-md border-white/15"
          : "bg-[rgba(249,249,249,0.88)] backdrop-blur-md border-black/5"
      )}
    >
      <div className="pointer-events-auto flex items-center">
        {isVoter ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            className={clsx(
              'text-left rounded-sm px-2 py-1 transition-colors',
              isAdmin ? 'hover:bg-white/10' : 'hover:bg-black/5'
            )}
            aria-label="Return to home"
            title="Return to home"
          >
            <h1 className={clsx('text-2xl font-muse font-bold tracking-tight', isAdmin ? 'text-white' : 'text-[var(--primary)]')}>
              The Editorial Ballot
            </h1>
          </button>
        ) : (
          <h1 className={clsx('text-2xl font-muse font-bold tracking-tight px-2 py-1', isAdmin ? 'text-white' : 'text-[var(--primary)]')}>
            The Editorial Ballot
          </h1>
        )}
      </div>

      <nav className="pointer-events-auto flex items-center gap-4 md:gap-6">
        {navItems.length ? (
          <ul className={clsx(
            'hidden md:flex items-center border-[1.5px]',
            isAdmin ? 'border-white/30 bg-white/5' : 'border-[var(--primary)] bg-white/70'
          )}>
            {navItems.map((item, index) => {
              const isActive = location.pathname === item.path;
              return (
                <li key={item.path} className={clsx(
                  "flex",
                  index > 0 && "border-l",
                  isAdmin ? "border-white/30" : "border-[var(--primary)]"
                )}>
                  {item.disabled ? (
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="This section is locked until its phase is active"
                      className={clsx(
                        'flex px-5 py-2 label-md transition-colors duration-300 cursor-not-allowed opacity-40',
                        isAdmin ? 'text-white/40' : 'text-[var(--primary-container)]'
                      )}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      className={clsx(
                        'flex px-5 py-2 label-md transition-all duration-300',
                        isAdmin ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-[var(--primary-container)] hover:bg-black/5',
                        isActive && (isAdmin ? 'text-white font-bold bg-white/15' : 'text-white font-bold bg-[var(--primary)] hover:bg-[var(--primary)]')
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
