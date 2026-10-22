import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, StatusRegion } from './Alert';
import { useAlertMessage } from './use-alert-message';

describe('Alert', () => {
  it('renders a danger alert as role="alert" with its icon and message', () => {
    render(<Alert tone="danger" testId="save-error" message="Name is required." />);

    const alert = screen.getByTestId('save-error');
    expect(alert).toHaveClass('sf-alert', 'sf-alert-danger');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.children).toHaveLength(2);
    expect(alert.children[0]).toHaveClass('sf-alert-icon');
    expect(alert.children[0]).toHaveAttribute('aria-hidden', 'true');
    expect(alert.children[0]).toHaveTextContent('!');
    expect(alert.children[1].tagName).toBe('P');
    expect(alert.children[1]).toHaveTextContent('Name is required.');
  });

  // EN-76: a success alert is not a live region itself; it is shown inside a
  // StatusRegion that was already on the page.
  it('renders a success alert without a role, with its icon and message', () => {
    render(<Alert tone="success" testId="saved" message="Saved." />);

    const alert = screen.getByTestId('saved');
    expect(alert).toHaveClass('sf-alert', 'sf-alert-success');
    expect(alert).not.toHaveAttribute('role');
    expect(alert.children[0]).toHaveTextContent('✓');
    expect(alert.children[1].tagName).toBe('P');
    expect(alert.children[1]).toHaveTextContent('Saved.');
  });

  it('puts the message and extra content in a section when it has children', () => {
    render(
      <Alert tone="success" testId="saved" message="Saved.">
        <button type="button">Continue</button>
      </Alert>,
    );

    const alert = screen.getByTestId('saved');
    expect(alert.children).toHaveLength(2);
    const section = alert.children[1];
    expect(section).toHaveClass('sf-section');
    expect(section.children[0].tagName).toBe('P');
    expect(section.children[0]).toHaveTextContent('Saved.');
    expect(section).toContainElement(screen.getByRole('button', { name: 'Continue' }));
  });

  it('keeps the message unwrapped when its extra content is conditionally absent', () => {
    render(
      <Alert tone="success" testId="saved" message="Saved.">
        {false}
      </Alert>,
    );

    expect(screen.getByTestId('saved').children[1].tagName).toBe('P');
  });

  // EN-76: keyed by useAlertMessage, the same text shown again after a clear
  // in one tick is a new alert element, so it is announced again.
  it('mounts a new alert element when the same message is shown again', () => {
    const { result } = renderHook(() => useAlertMessage());
    act(() => result.current.show('Name is required.'));
    const page = () =>
      result.current.message === null ? null : (
        <Alert
          key={result.current.key}
          tone="danger"
          testId="save-error"
          message={result.current.message}
        />
      );
    const { rerender } = render(page());
    const first = screen.getByTestId('save-error');

    act(() => {
      result.current.clear();
      result.current.show('Name is required.');
    });
    rerender(page());

    const second = screen.getByTestId('save-error');
    expect(second).toHaveTextContent('Name is required.');
    expect(second).not.toBe(first);
  });
});

describe('StatusRegion', () => {
  it('is a role="status" region that stays on the page while empty', () => {
    const { rerender } = render(<StatusRegion>{null}</StatusRegion>);

    const region = screen.getByRole('status');
    expect(region).toHaveClass('sf-status-region');
    expect(region).toBeEmptyDOMElement();

    rerender(
      <StatusRegion>
        <Alert tone="success" testId="saved" message="Saved." />
      </StatusRegion>,
    );

    expect(screen.getByRole('status')).toBe(region);
    expect(region).toContainElement(screen.getByTestId('saved'));
  });
});
