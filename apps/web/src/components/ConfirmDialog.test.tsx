import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  return render(
    <ConfirmDialog
      open
      title="Deactivate user"
      message="This cannot be undone."
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ConfirmDialog', () => {
  it('is not open when the open prop is false', () => {
    renderDialog({ open: false });

    expect(screen.getByTestId('confirm-dialog')).not.toHaveAttribute('open');
  });

  it('opens the native dialog via showModal when the open prop is true', () => {
    renderDialog();

    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('renders the caller-supplied title and message', () => {
    renderDialog();

    expect(screen.getByText('Deactivate user')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders i18n'd Confirm/Cancel button labels, not hardcoded English", () => {
    renderDialog();

    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel');
  });
});
