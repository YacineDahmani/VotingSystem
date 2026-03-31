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
  if (!open) {
    return null;
  }

  const confirmClass = confirmTone === 'danger'
    ? 'bg-red-700 text-[var(--on-primary)] hover:bg-red-800'
    : 'bg-[var(--primary)] text-[var(--on-primary)] hover:opacity-90';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-lg bg-[var(--surface-container-lowest)] p-7 shadow-2xl">
        <h3 className="font-muse text-3xl text-[var(--primary)]">{title}</h3>
        <p className="mt-4 text-sm leading-relaxed text-[var(--on-surface)] opacity-90">{message}</p>

        <div className="mt-7 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border border-[var(--outline-variant)] px-5 py-2 text-xs uppercase tracking-widest text-[var(--on-surface)] opacity-90 transition-all duration-200 hover:bg-[var(--surface-container)] shadow-sm active:translate-y-0.5"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`px-5 py-2 text-xs uppercase tracking-widest transition-transform duration-200 shadow-md hover:-translate-y-0.5 active:translate-y-0 ${confirmClass}`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
