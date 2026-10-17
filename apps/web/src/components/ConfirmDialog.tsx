import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  tone: 'danger' | 'primary';
};

// design.md Decision 4: native <dialog> over window.confirm — the browser
// supplies modality, focus trap and Esc-to-cancel, and unlike
// window.confirm the button labels are ours (i18n'd), not the browser
// locale's. Reusable across any destructive-confirmation flow (first
// consumer: UsersListPage deactivate, PR6). title/message are
// caller-supplied and already translated, so this component owns no
// domain-specific copy — only the generic Confirm/Cancel labels.
// confirmLabel (review-export, PR1) lets a caller override the confirm
// button's copy (e.g. "Sign and close") when the generic Confirm label
// doesn't convey what confirming actually does; it defaults to the
// existing generic label so every other caller is unaffected.
// tone (EN-62) picks the confirm button's look: 'danger' when confirming
// removes or deactivates data, 'primary' otherwise (design system
// ConfirmDialog). It is required so each caller decides it explicitly
// (user decision, 2026-10-17). Cancel comes first, so the native dialog's
// initial focus lands on it.
export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  tone,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="sf-dialog"
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onCancel={onCancel}
    >
      <h2 id={titleId} className="sf-dialog-title">
        {title}
      </h2>
      <p>{message}</p>
      <div className="sf-actions">
        <button
          type="button"
          className="sf-btn sf-btn-ghost"
          onClick={onCancel}
          data-testid="confirm-dialog-cancel"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className={`sf-btn sf-btn-${tone}`}
          onClick={onConfirm}
          data-testid="confirm-dialog-confirm"
        >
          {confirmLabel ?? t('common.confirm')}
        </button>
      </div>
    </dialog>
  );
}
