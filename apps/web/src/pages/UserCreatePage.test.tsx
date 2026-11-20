import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as maintenanceCompanyApi from '../api/maintenance-company';
import * as usersApi from '../api/users';
import { UserCreatePage } from './UserCreatePage';

vi.mock('../api/users');
vi.mock('../api/maintenance-company');

const mockedCreateUser = vi.mocked(usersApi.createUser);
const mockedListMaintenanceCompanies = vi.mocked(maintenanceCompanyApi.listMaintenanceCompanies);

const COMPANIES = [
  { id: 'company-1', name: 'Acme Maintenance', taxId: 'A1', contactInfo: 'x' },
  { id: 'company-2', name: 'Beta Repairs', taxId: 'B2', contactInfo: 'y' },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/users/new']}>
      <Routes>
        <Route path="/users/new" element={<UserCreatePage />} />
        <Route path="/users" element={<div data-testid="users-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_EMAIL = 'new.user@sf-manager.example';
const VALID_PASSWORD = 'correct-horse-1';

describe('UserCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListMaintenanceCompanies.mockResolvedValue(COMPANIES);
  });

  it('blocks submission client-side and shows a validation error when the password is weak', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  // EN-193: say which field failed, next to it, instead of one generic
  // message that reads as if the email were rejected.
  describe('field errors', () => {
    const RULES = 'At least 10 characters, with at least one letter and one digit.';

    it('states the password rules under the field before any submission', () => {
      renderPage();

      expect(screen.getByTestId('user-create-password-rules')).toHaveTextContent(RULES);
      expect(screen.getByTestId('user-create-password')).toHaveAttribute(
        'aria-describedby',
        'user-create-password-rules',
      );
      expect(screen.queryByTestId('user-create-password-error')).not.toBeInTheDocument();
    });

    it('marks only the password when a valid email has a weak password', async () => {
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
      fireEvent.change(screen.getByTestId('user-create-password'), {
        target: { value: 'Admin123!' },
      });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-password-error')).toHaveTextContent(RULES);
      expect(screen.getByTestId('user-create-password')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByTestId('user-create-email-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-create-email')).toHaveAttribute('aria-invalid', 'false');
      expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it('marks only the email when an invalid email has a valid password', async () => {
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), {
        target: { value: 'not-an-email' },
      });
      fireEvent.change(screen.getByTestId('user-create-password'), {
        target: { value: VALID_PASSWORD },
      });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-email-error')).toHaveTextContent(
        'Enter a valid email address.',
      );
      expect(screen.getByTestId('user-create-email')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('user-create-email')).toHaveAttribute(
        'aria-describedby',
        'user-create-email-error',
      );
      expect(screen.queryByTestId('user-create-password-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-create-password-rules')).toBeInTheDocument();
      expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it('marks both fields when both are invalid', async () => {
      renderPage();

      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-email-error')).toBeInTheDocument();
      expect(screen.getByTestId('user-create-password-error')).toHaveTextContent(RULES);
      expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it('marks the company when a maintenance role has no company chosen', async () => {
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
      fireEvent.change(screen.getByTestId('user-create-password'), {
        target: { value: VALID_PASSWORD },
      });
      fireEvent.change(screen.getByTestId('user-create-role'), {
        target: { value: 'MAINTENANCE_TECHNICIAN' },
      });
      await screen.findByTestId('user-create-company');
      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-company-error')).toHaveTextContent(
        'Select a maintenance company.',
      );
      expect(screen.getByTestId('user-create-company')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.queryByTestId('user-create-email-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('user-create-password-error')).not.toBeInTheDocument();
    });

    // EN-204: with every field failing, the company must still be marked, not
    // only the first issues the schema reports.
    it('marks all three fields when the email, the password and the company are all invalid', async () => {
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), {
        target: { value: 'not-an-email' },
      });
      // 'short' breaks two password rules, so the company is the schema's
      // fourth issue: keep a password that fails twice, or a page bug that
      // marks only the first three issues goes unnoticed.
      fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
      fireEvent.change(screen.getByTestId('user-create-role'), {
        target: { value: 'MAINTENANCE_TECHNICIAN' },
      });
      await screen.findByTestId('user-create-company');
      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-company-error')).toHaveTextContent(
        'Select a maintenance company.',
      );
      expect(screen.getByTestId('user-create-company')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('user-create-company')).toHaveAttribute(
        'aria-describedby',
        'user-create-company-error',
      );
      expect(screen.getByTestId('user-create-email-error')).toHaveTextContent(
        'Enter a valid email address.',
      );
      expect(screen.getByTestId('user-create-email')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByTestId('user-create-email')).toHaveAttribute(
        'aria-describedby',
        'user-create-email-error',
      );
      expect(screen.getByTestId('user-create-password-error')).toHaveTextContent(RULES);
      expect(screen.getByTestId('user-create-password')).toHaveAttribute('aria-invalid', 'true');
      expect(mockedCreateUser).not.toHaveBeenCalled();
    });

    it('points to the marked fields in the alert instead of naming both fields', async () => {
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
      fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      expect(await screen.findByTestId('user-create-error')).toHaveTextContent(
        'Fix the fields marked below.',
      );
    });

    it('clears a field error once the corrected form is submitted', async () => {
      mockedCreateUser.mockRejectedValue(new ApiError(409, 'EMAIL_ALREADY_IN_USE'));
      renderPage();

      fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
      fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
      fireEvent.click(screen.getByTestId('user-create-submit'));
      await screen.findByTestId('user-create-password-error');

      fireEvent.change(screen.getByTestId('user-create-password'), {
        target: { value: VALID_PASSWORD },
      });
      fireEvent.click(screen.getByTestId('user-create-submit'));

      await waitFor(() => expect(mockedCreateUser).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('user-create-password-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-create-password-rules')).toBeInTheDocument();
    });
  });

  it('keeps the alert in the same language as the field errors after a language switch', async () => {
    renderPage();

    fireEvent.click(screen.getByTestId('user-create-submit'));
    await screen.findByTestId('user-create-error');

    await act(() => i18n.changeLanguage('es'));
    try {
      expect(screen.getByTestId('user-create-error')).toHaveTextContent(
        'Corrige los campos marcados abajo.',
      );
      expect(screen.getByTestId('user-create-email-error')).toHaveTextContent(
        'Introduce una dirección de correo electrónico válida.',
      );
    } finally {
      await act(() => i18n.changeLanguage('en'));
    }
  });

  // EN-76: the handler clears the error and sets the same text again in
  // one tick; the alert must still be a new element so it is announced.
  it('announces the validation error again when the same invalid form is submitted again', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    const first = await screen.findByTestId('user-create-error');
    fireEvent.click(screen.getByTestId('user-create-submit'));

    const second = screen.getByTestId('user-create-error');
    expect(second).toHaveTextContent(first.textContent ?? '');
    expect(second).not.toBe(first);
  });

  it('navigates to the users list without a manual reload on a valid submission', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-3',
      email: VALID_EMAIL,
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: null,
      managerCapabilities: [],
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() =>
      expect(mockedCreateUser).toHaveBeenCalledWith({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'SYSTEM_ADMIN',
      }),
    );
    expect(await screen.findByTestId('users-list-sentinel')).toBeInTheDocument();
  });

  it('shows a specific duplicate-email message (not a generic conflict message) on a 409 EMAIL_ALREADY_IN_USE response', async () => {
    mockedCreateUser.mockRejectedValue(new ApiError(409, 'EMAIL_ALREADY_IN_USE'));
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toHaveTextContent(
      'This email is already in use by another user.',
    );
    expect(screen.queryByTestId('users-list-sentinel')).not.toBeInTheDocument();
  });

  it('does not show the company selector for the default (non-maintenance) role', () => {
    renderPage();

    expect(screen.queryByTestId('user-create-company')).not.toBeInTheDocument();
  });

  it('shows the company selector, populated from GET /maintenance-companies, when a maintenance role is selected', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });

    const select = await screen.findByTestId('user-create-company');
    expect(select).toBeInTheDocument();
    expect(select).toBeRequired();
    expect(screen.getByText('Acme Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Beta Repairs')).toBeInTheDocument();
  });

  it('hides the company selector again, and omits maintenanceCompanyId from the payload, when the role changes away from maintenance', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-4',
      email: VALID_EMAIL,
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: null,
      managerCapabilities: [],
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-1' },
    });
    fireEvent.change(screen.getByTestId('user-create-role'), { target: { value: 'SYSTEM_ADMIN' } });

    expect(screen.queryByTestId('user-create-company')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() =>
      expect(mockedCreateUser).toHaveBeenCalledWith({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'SYSTEM_ADMIN',
      }),
    );
  });

  it('submits the selected maintenanceCompanyId when a maintenance role is chosen', async () => {
    mockedCreateUser.mockResolvedValue({
      id: 'user-5',
      email: VALID_EMAIL,
      role: 'MAINTENANCE_TECHNICIAN',
      maintenanceCompanyId: 'company-2',
      managerCapabilities: [],
    });
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-2' },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    await waitFor(() =>
      expect(mockedCreateUser).toHaveBeenCalledWith({
        email: VALID_EMAIL,
        password: VALID_PASSWORD,
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-2',
      }),
    );
  });

  it('blocks submission client-side when a maintenance role is selected but no company is chosen', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    await screen.findByTestId('user-create-company');
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toBeInTheDocument();
    expect(mockedCreateUser).not.toHaveBeenCalled();
  });

  it('shows a distinct message for a 400 MAINTENANCE_COMPANY_NOT_FOUND response', async () => {
    mockedCreateUser.mockRejectedValue(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_FOUND'));
    renderPage();

    fireEvent.change(screen.getByTestId('user-create-email'), { target: { value: VALID_EMAIL } });
    fireEvent.change(screen.getByTestId('user-create-password'), {
      target: { value: VALID_PASSWORD },
    });
    fireEvent.change(screen.getByTestId('user-create-role'), {
      target: { value: 'MAINTENANCE_TECHNICIAN' },
    });
    fireEvent.change(await screen.findByTestId('user-create-company'), {
      target: { value: 'company-1' },
    });
    fireEvent.click(screen.getByTestId('user-create-submit'));

    expect(await screen.findByTestId('user-create-error')).toHaveTextContent(
      'The selected maintenance company no longer exists.',
    );
  });

  describe('design system', () => {
    it('renders the title in a page header and the form as field groups with the submit as the primary action', async () => {
      renderPage();
      fireEvent.change(screen.getByTestId('user-create-role'), {
        target: { value: 'MAINTENANCE_TECHNICIAN' },
      });
      await screen.findByTestId('user-create-company');

      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      const submit = screen.getByTestId('user-create-submit');
      expect(submit.closest('form')).toHaveClass('sf-form');
      expect(submit).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(submit.parentElement).toHaveClass('sf-actions');
      for (const field of ['email', 'password', 'role', 'company']) {
        const control = screen.getByTestId(`user-create-${field}`);
        const group = control.parentElement;
        expect(group).toHaveClass('sf-field');
        expect(group?.querySelector(`label[for="${control.id}"]`)).not.toBeNull();
      }
    });

    it('shows the form error as a danger alert', async () => {
      renderPage();

      fireEvent.click(screen.getByTestId('user-create-submit'));

      const error = await screen.findByTestId('user-create-error');
      expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
      expect(error).toHaveAttribute('role', 'alert');
    });
  });
});
