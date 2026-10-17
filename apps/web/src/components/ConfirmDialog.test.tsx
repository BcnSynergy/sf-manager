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
      tone="danger"
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

  it('closes the native dialog when open transitions from true to false', () => {
    const { rerender } = renderDialog({ open: true });
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');

    rerender(
      <ConfirmDialog
        open={false}
        title="Deactivate user"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        tone="danger"
      />,
    );

    expect(screen.getByTestId('confirm-dialog')).not.toHaveAttribute('open');
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

  it('defaults the confirm button label to the generic Confirm copy when confirmLabel is omitted', () => {
    renderDialog();

    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm');
  });

  it('renders the caller-supplied confirmLabel on the confirm button when provided', () => {
    renderDialog({ confirmLabel: 'Sign and close' });

    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Sign and close');
  });
  it('uses the design system dialog: title, message, then Cancel (ghost) before the action', () => {
    renderDialog();

    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog).toHaveClass('sf-dialog');
    expect(screen.getByRole('heading', { name: 'Deactivate user' })).toHaveClass('sf-dialog-title');
    const cancel = screen.getByTestId('confirm-dialog-cancel');
    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(cancel).toHaveClass('sf-btn', 'sf-btn-ghost');
    expect(cancel.parentElement).toHaveClass('sf-actions');
    expect(confirm.parentElement).toBe(cancel.parentElement);
    expect(cancel.nextElementSibling).toBe(confirm);
  });

  it('is named by its title for assistive technology', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Deactivate user' })).toBe(
      screen.getByTestId('confirm-dialog'),
    );
  });

  it('styles the confirm button as danger when the action removes data', () => {
    renderDialog({ tone: 'danger' });

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm).toHaveClass('sf-btn', 'sf-btn-danger');
    expect(confirm).not.toHaveClass('sf-btn-primary');
  });

  it('styles the confirm button as primary when the action removes nothing', () => {
    renderDialog({ tone: 'primary', confirmLabel: 'Sign and close' });

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm).toHaveClass('sf-btn', 'sf-btn-primary');
    expect(confirm).not.toHaveClass('sf-btn-danger');
  });
});
