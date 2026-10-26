import { isApiDocsEnabled } from './api-docs-enabled';

// TD-40: Swagger UI and the OpenAPI document are off in production unless
// API_DOCS_ENABLED=true turns them on; elsewhere they are on unless
// API_DOCS_ENABLED=false turns them off.
describe('isApiDocsEnabled', () => {
  it('is false in production when API_DOCS_ENABLED is unset', () => {
    expect(isApiDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
  });

  it('is false in production when API_DOCS_ENABLED is empty', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'production', API_DOCS_ENABLED: '' }),
    ).toBe(false);
  });

  it('is true in production when API_DOCS_ENABLED is "true"', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'production', API_DOCS_ENABLED: 'true' }),
    ).toBe(true);
  });

  it('is false in production when API_DOCS_ENABLED is "false"', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'production', API_DOCS_ENABLED: 'false' }),
    ).toBe(false);
  });

  it('is true outside production when API_DOCS_ENABLED is unset', () => {
    expect(isApiDocsEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(isApiDocsEnabled({})).toBe(true);
  });

  it('is true outside production when API_DOCS_ENABLED is empty', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'development', API_DOCS_ENABLED: '' }),
    ).toBe(true);
  });

  it('is true outside production when API_DOCS_ENABLED is "true"', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'development', API_DOCS_ENABLED: 'true' }),
    ).toBe(true);
  });

  it('is false outside production when API_DOCS_ENABLED is "false"', () => {
    expect(
      isApiDocsEnabled({ NODE_ENV: 'development', API_DOCS_ENABLED: 'false' }),
    ).toBe(false);
  });

  it('throws on any other API_DOCS_ENABLED value', () => {
    expect(() =>
      isApiDocsEnabled({ NODE_ENV: 'production', API_DOCS_ENABLED: 'yes' }),
    ).toThrow('API_DOCS_ENABLED must be "true" or "false", got "yes"');
  });
});
