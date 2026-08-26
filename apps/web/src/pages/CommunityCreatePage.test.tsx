import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as communityApi from '../api/community';
import { CommunityCreatePage } from './CommunityCreatePage';

vi.mock('../api/community');

const mockedCreateCommunity = vi.mocked(communityApi.createCommunity);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/communities/new']}>
      <Routes>
        <Route path="/communities/new" element={<CommunityCreatePage />} />
        <Route path="/communities" element={<div data-testid="communities-list-sentinel" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_NAME = 'Sunset Towers';
const VALID_ADDRESS = '123 Main St';

describe('CommunityCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks submission client-side and shows a validation error when a required field is empty', async () => {
    renderPage();

    fireEvent.change(screen.getByTestId('community-create-name'), { target: { value: '' } });
    fireEvent.change(screen.getByTestId('community-create-address'), {
      target: { value: VALID_ADDRESS },
    });
    fireEvent.click(screen.getByTestId('community-create-submit'));

    expect(await screen.findByTestId('community-create-error')).toBeInTheDocument();
    expect(mockedCreateCommunity).not.toHaveBeenCalled();
  });

  it('renders locale options through the locale label map, not the raw enum value', () => {
    renderPage();

    const select = screen.getByTestId('community-create-locale');
    expect(select).toHaveTextContent('English');
    expect(select).toHaveTextContent('Spanish');
    expect(select).toHaveTextContent('Catalan');
  });

  it('navigates to the communities list without a manual reload on a valid submission', async () => {
    mockedCreateCommunity.mockResolvedValue({
      id: 'community-3',
      name: VALID_NAME,
      address: VALID_ADDRESS,
      locale: 'en',
    });
    renderPage();

    fireEvent.change(screen.getByTestId('community-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.change(screen.getByTestId('community-create-address'), {
      target: { value: VALID_ADDRESS },
    });
    fireEvent.change(screen.getByTestId('community-create-locale'), {
      target: { value: 'es' },
    });
    fireEvent.click(screen.getByTestId('community-create-submit'));

    await waitFor(() =>
      expect(mockedCreateCommunity).toHaveBeenCalledWith({
        name: VALID_NAME,
        address: VALID_ADDRESS,
        locale: 'es',
      }),
    );
    expect(await screen.findByTestId('communities-list-sentinel')).toBeInTheDocument();
  });

  it('shows a mapped error message (not English server prose) when the server rejects the request', async () => {
    mockedCreateCommunity.mockRejectedValue(new ApiError(400));
    renderPage();

    fireEvent.change(screen.getByTestId('community-create-name'), {
      target: { value: VALID_NAME },
    });
    fireEvent.change(screen.getByTestId('community-create-address'), {
      target: { value: VALID_ADDRESS },
    });
    fireEvent.click(screen.getByTestId('community-create-submit'));

    expect(await screen.findByTestId('community-create-error')).toBeInTheDocument();
    expect(screen.queryByTestId('communities-list-sentinel')).not.toBeInTheDocument();
  });
});
