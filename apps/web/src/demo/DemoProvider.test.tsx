import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDemoInfo } from './demo-context';
import { DemoProvider } from './DemoProvider';

const DEMO = {
  enabled: true,
  password: 'sf-manager-demo-1',
  accounts: [{ email: 'gestor@demo.sf-manager.example', role: 'MANAGER' }],
};

function Probe() {
  const demo = useDemoInfo();
  return <p data-testid="probe">{demo ? demo.password : 'none'}</p>;
}

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn<(url: RequestInfo | URL) => Promise<Response>>(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// demo-instance S6 (spec `deployment`, "Demo identification").
describe('DemoProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the API once and gives the demo info to its children', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => DEMO } as Response),
    );

    render(
      <DemoProvider>
        <Probe />
        <Probe />
      </DemoProvider>,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('probe').map((p) => p.textContent)).toEqual([
        'sf-manager-demo-1',
        'sf-manager-demo-1',
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/demo$/);
  });

  it('gives nothing outside the demo', async () => {
    const json = vi.fn(async () => ({ enabled: false }));
    stubFetch(() => Promise.resolve({ ok: true, status: 200, json } as unknown as Response));

    render(
      <DemoProvider>
        <Probe />
      </DemoProvider>,
    );

    // The answer was read; let the provider's handler run before asserting.
    await waitFor(() => expect(json).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('gives nothing when the API cannot be reached', async () => {
    const fetchMock = stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    render(
      <DemoProvider>
        <Probe />
      </DemoProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('gives nothing without a provider', () => {
    render(<Probe />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
