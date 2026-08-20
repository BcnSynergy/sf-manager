import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { HealthPage } from './HealthPage';

describe('HealthPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true } as Response),
    );
  });

  it('renders the health check result once the API responds', async () => {
    render(<HealthPage />);

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );
  });
});
