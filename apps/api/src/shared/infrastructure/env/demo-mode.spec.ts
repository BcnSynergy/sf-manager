import { isDemoMode } from './demo-mode';

// demo-instance S6 (spec `deployment`, "Demo identification"): only the demo
// stack sets DEMO_MODE=true; anything but unset, empty, "true" or "false"
// stops the API at boot, like API_DOCS_ENABLED.
describe('isDemoMode', () => {
  it('is false when DEMO_MODE is unset', () => {
    expect(isDemoMode({})).toBe(false);
  });

  it('is false when DEMO_MODE is empty', () => {
    expect(isDemoMode({ DEMO_MODE: '' })).toBe(false);
  });

  it('is true when DEMO_MODE is "true"', () => {
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true);
  });

  it('is false when DEMO_MODE is "false"', () => {
    expect(isDemoMode({ DEMO_MODE: 'false' })).toBe(false);
  });

  it.each(['TRUE', 'yes', '1'])('throws on "%s", naming DEMO_MODE', (raw) => {
    expect(() => isDemoMode({ DEMO_MODE: raw })).toThrow(
      `DEMO_MODE must be "true" or "false", got "${raw}"`,
    );
  });
});
