import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
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
export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);

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
    <dialog ref={dialogRef} data-testid="confirm-dialog" onCancel={onCancel}>
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" onClick={onCancel} data-testid="confirm-dialog-cancel">
        {t('common.cancel')}
      </button>
      <button type="button" onClick={onConfirm} data-testid="confirm-dialog-confirm">
        {confirmLabel ?? t('common.confirm')}
      </button>
    </dialog>
  );
}
