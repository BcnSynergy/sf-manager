import type { ReactNode } from 'react';

type AlertProps = {
  tone: 'danger' | 'success';
  testId: string;
  message: string;
  // Extra content after the message, such as the next-step action.
  children?: ReactNode;
};

const ICONS = { danger: '!', success: '✓' } as const;

// EN-76: the one-line message above the content it concerns. A danger alert
// is its own `role="alert"`, announced when it mounts (give it a new `key`
// per message, see use-alert-message.ts). A success alert has no role: it
// goes inside a StatusRegion, because a `role="status"` added already filled
// is not reliably announced.
export function Alert({ tone, testId, message, children }: AlertProps) {
  return (
    <div
      className={`sf-alert sf-alert-${tone}`}
      role={tone === 'danger' ? 'alert' : undefined}
      data-testid={testId}
    >
      <span className="sf-alert-icon" aria-hidden="true">
        {ICONS[tone]}
      </span>
      {children === undefined || children === null || children === false ? (
        <p>{message}</p>
      ) : (
        <div className="sf-section">
          <p>{message}</p>
          {children}
        </div>
      )}
    </div>
  );
}

// A polite live region that stays on the page, so a confirmation shown
// inside it later is announced.
export function StatusRegion({ children }: { children: ReactNode }) {
  return (
    <div className="sf-status-region" role="status">
      {children}
    </div>
  );
}
