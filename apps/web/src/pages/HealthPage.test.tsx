import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { AuthProvider } from '../auth/AuthProvider';
import { HealthPage } from './HealthPage';

// nav-menu/design.md Decision 7: 12 of the 13 tests this file used to have
// were removed/relocated to AppLayout.test.tsx (logout success + logout
// network-failure, and the 10 role-conditional link/enumeration cases,
// subsumed by AppLayout.test.tsx's role -> items matrix and write-surface
// guard). Only the health-readout test survives.
function mockFetch() {
  return vi.fn((url: RequestInfo | URL) => {
    const href = String(url);
    if (href.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: '1',
          email: 'admin@sf-manager.example',
          role: 'SYSTEM_ADMIN',
        }),
      } as Response);
    }
    return Promise.resolve({ ok: true } as Response);
  });
}

function renderHealthPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HealthPage />} />
          <Route path="/login" element={<div data-testid="login-page">login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('HealthPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch());
  });

  it('renders the health check result once the API responds', async () => {
    renderHealthPage();

    await waitFor(() =>
      expect(screen.getByTestId('health-status')).toHaveTextContent('All systems operational'),
    );
  });
});
