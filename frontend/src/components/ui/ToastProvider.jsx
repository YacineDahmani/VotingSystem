import { useCallback, useMemo, useState } from 'react';
import { ToastContext } from './ToastContext';

const TOAST_STYLES = {
  success: 'border-green-300 bg-green-50 text-green-900',
  error: 'border-red-300 bg-red-50 text-red-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-sky-300 bg-sky-50 text-sky-900',
};

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
      duration: typeof toast.duration === 'number' ? toast.duration : 3200,
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
      <div className="fixed right-4 top-24 z-[120] flex w-[min(28rem,92vw)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`shadow-lg border px-4 py-3 ${TOAST_STYLES[toast.type] || TOAST_STYLES.info}`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label-md font-bold tracking-[0.14em] uppercase">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-sm leading-relaxed">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-xs uppercase tracking-widest opacity-75 hover:opacity-100"
                aria-label="Dismiss notification"
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
