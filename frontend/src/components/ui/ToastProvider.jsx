import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ToastContext } from './ToastContext';

const TOAST_THEMES = {
  success: {
    card: 'bg-white dark:bg-[#1a221e] border-l-4 border-l-emerald-600 dark:border-l-emerald-400 border-[var(--on-surface)]/15 shadow-lg',
    badge: 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50',
    title: 'text-emerald-950 dark:text-emerald-50',
    message: 'text-emerald-900/80 dark:text-emerald-200/80',
    defaultTitle: 'Success',
  },
  error: {
    card: 'bg-white dark:bg-[#241a1c] border-l-4 border-l-rose-600 dark:border-l-rose-400 border-[var(--on-surface)]/15 shadow-lg',
    badge: 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700/50',
    title: 'text-rose-950 dark:text-rose-50',
    message: 'text-rose-900/80 dark:text-rose-200/80',
    defaultTitle: 'Error',
  },
  warning: {
    card: 'bg-white dark:bg-[#242018] border-l-4 border-l-amber-600 dark:border-l-amber-400 border-[var(--on-surface)]/15 shadow-lg',
    badge: 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/50',
    title: 'text-amber-950 dark:text-amber-50',
    message: 'text-amber-900/80 dark:text-amber-200/80',
    defaultTitle: 'Warning',
  },
  info: {
    card: 'bg-white dark:bg-[#182028] border-l-4 border-l-blue-600 dark:border-l-blue-400 border-[var(--on-surface)]/15 shadow-lg',
    badge: 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50',
    title: 'text-blue-950 dark:text-blue-50',
    message: 'text-blue-900/80 dark:text-blue-200/80',
    defaultTitle: 'Notice',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const theme = TOAST_THEMES[toast.type] || TOAST_THEMES.info;

    const nextToast = {
      id,
      type: toast.type || 'info',
      title: toast.title || theme.defaultTitle,
      message: toast.message || '',
      duration: typeof toast.duration === 'number' ? toast.duration : 4000,
    };

    setToasts((current) => [...current, nextToast]);

    if (nextToast.duration > 0) {
      window.setTimeout(() => {
        dismissToast(id);
      }, nextToast.duration);
    }

    return id;
  }, [dismissToast]);

  const value = useMemo(() => ({
    pushToast,
    dismissToast,
  }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed right-4 sm:right-6 top-20 z-[150] flex w-[min(22rem,92vw)] flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const theme = TOAST_THEMES[toast.type] || TOAST_THEMES.info;

          return (
            <div
              key={toast.id}
              className={`p-4 border pointer-events-auto transition-all duration-200 flex items-start justify-between gap-3 ${theme.card}`}
              role="alert"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wider rounded-none ${theme.badge}`}>
                    {toast.type || 'info'}
                  </span>
                  <p className={`text-xs font-bold font-sans tracking-wide uppercase ${theme.title}`}>
                    {toast.title}
                  </p>
                </div>
                {toast.message ? (
                  <p className={`text-xs font-sans leading-relaxed break-words mt-1 ${theme.messageColor || theme.message}`}>
                    {toast.message}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="opacity-40 hover:opacity-100 transition-opacity p-1 text-[var(--on-surface)] shrink-0"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
