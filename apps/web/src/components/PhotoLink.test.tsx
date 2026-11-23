import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '../api/client';
import { ApiError } from '../api/client';
import { PhotoLink } from './PhotoLink';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof client>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(client.apiFetch);
const URL_OF_PHOTO = 'http://api.test/review-sessions/s1/photos/p1';

type FakeTab = {
  opener: unknown;
  closed: boolean;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

function fakeTab(): FakeTab {
  return { opener: window, closed: false, location: { href: 'about:blank' }, close: vi.fn() };
}

function renderLink() {
  render(
    <PhotoLink href={URL_OF_PHOTO} aria-label="Open photo 1" data-testid="photo-link">
      <span>thumb</span>
    </PhotoLink>,
  );
  return screen.getByTestId('photo-link');
}

describe('PhotoLink (TD-54)', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    openSpy = vi.spyOn(window, 'open');
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('keeps a plain link to the photo in a new tab', () => {
    const link = renderLink();

    expect(link).toHaveAttribute('href', URL_OF_PHOTO);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName('Open photo 1');
  });

  it('checks the session, which refreshes an expired one, before loading the photo', async () => {
    const tab = fakeTab();
    openSpy.mockReturnValue(tab as unknown as Window);
    let finishCheck: (value: undefined) => void = () => undefined;
    mockedApiFetch.mockReturnValue(new Promise((resolve) => (finishCheck = resolve)));
    const link = renderLink();

    const notPrevented = fireEvent.click(link);

    expect(notPrevented).toBe(false);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me');
    expect(tab.location.href).toBe('about:blank');

    finishCheck(undefined);
    await waitFor(() => expect(tab.location.href).toBe(URL_OF_PHOTO));
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('closes the new tab when the session has ended', async () => {
    const tab = fakeTab();
    openSpy.mockReturnValue(tab as unknown as Window);
    mockedApiFetch.mockRejectedValue(new ApiError(401));

    fireEvent.click(renderLink());

    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(tab.location.href).toBe('about:blank');
  });

  it('still loads the photo when the check fails for another reason', async () => {
    const tab = fakeTab();
    openSpy.mockReturnValue(tab as unknown as Window);
    mockedApiFetch.mockRejectedValue(new ApiError(0));

    fireEvent.click(renderLink());

    await waitFor(() => expect(tab.location.href).toBe(URL_OF_PHOTO));
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('falls back to the plain link when the browser blocks the new tab', () => {
    openSpy.mockReturnValue(null);

    const notPrevented = fireEvent.click(renderLink());

    expect(notPrevented).toBe(true);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta (cmd)', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['non-left button', { button: 1 }],
  ])('leaves a %s click to the browser', (_name, init) => {
    const notPrevented = fireEvent.click(renderLink(), init);

    expect(notPrevented).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("leaves the click alone when the caller's onClick prevented it", () => {
    render(
      <PhotoLink href={URL_OF_PHOTO} onClick={(event) => event.preventDefault()} data-testid="l">
        <span>thumb</span>
      </PhotoLink>,
    );

    fireEvent.click(screen.getByTestId('l'));

    expect(openSpy).not.toHaveBeenCalled();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('does not load the photo into a tab the user closed during the check', async () => {
    const tab = fakeTab();
    openSpy.mockReturnValue(tab as unknown as Window);
    let finishCheck: (value: undefined) => void = () => undefined;
    const check = new Promise<undefined>((resolve) => (finishCheck = resolve));
    mockedApiFetch.mockReturnValue(check);

    fireEvent.click(renderLink());
    tab.closed = true;
    finishCheck(undefined);
    await check;
    await Promise.resolve();

    expect(tab.location.href).toBe('about:blank');
  });
});
