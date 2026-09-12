import { useEffect } from 'react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'primary',
  onConfirm,
  onCancel,
  busy = false,
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy && onCancel) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  const confirmClass = confirmTone === 'danger'
    ? 'bg-red-700 text-[var(--on-primary)] hover:bg-red-800'
    : 'bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-xs px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && onCancel) {
          onCancel();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-lg bg-[var(--surface-container-lowest)] border border-[var(--on-surface)]/15 p-7 shadow-2xl"
      >
        <h3 id="confirm-dialog-title" className="font-muse text-3xl text-[var(--primary)]">{title}</h3>
        <p id="confirm-dialog-desc" className="mt-4 text-sm leading-relaxed text-[var(--on-surface)] opacity-90">{message}</p>

        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border border-[var(--outline-variant)] px-5 py-2 text-xs uppercase tracking-widest text-[var(--on-surface)] opacity-90 transition-all duration-200 hover:bg-[var(--surface-container)] shadow-sm active:translate-y-0.5 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-2 text-xs uppercase tracking-widest transition-transform duration-200 shadow-md hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 ${confirmClass}`}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

