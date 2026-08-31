import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ToastContext } from './ToastContext';

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextToast = {
      id,
      type: toast.type || 'info',
      title: toast.title || 'Notice',
      message: toast.message || '',
      duration: typeof toast.duration === 'number' ? toast.duration : 3600,
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
      <div className="fixed right-4 top-20 z-[120] flex w-[min(28rem,92vw)] flex-col gap-2.5 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-[var(--surface-container-lowest)] text-[var(--on-surface)] shadow-2xl p-4 border border-[var(--on-surface)]/20 flex items-start justify-between gap-3 backdrop-blur-md pointer-events-auto transition-all animate-fade-in"
            role="status"
            aria-live="polite"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold tracking-wider uppercase text-[var(--on-surface)]">
                {toast.title}
              </p>
              {toast.message ? (
                <p className="mt-1 text-xs text-[var(--on-surface)] opacity-80 leading-relaxed break-words">
                  {toast.message}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-[var(--on-surface)] opacity-40 hover:opacity-100 transition-opacity p-1 shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
