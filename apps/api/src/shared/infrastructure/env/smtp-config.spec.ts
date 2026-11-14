import { getSmtpConfig } from './smtp-config';

const production = {
  NODE_ENV: 'production',
  SMTP_HOST: 'smtp-relay.example.com',
  SMTP_USER: 'relay-user',
  SMTP_PASSWORD: 'relay-password-value',
  SMTP_FROM: 'SF-Manager <no-reply@example.com>',
};

describe('getSmtpConfig', () => {
  it('reads every value in production, on port 587 with STARTTLS required by default', () => {
    expect(getSmtpConfig(production)).toEqual({
      host: 'smtp-relay.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'relay-user', pass: 'relay-password-value' },
      from: 'SF-Manager <no-reply@example.com>',
    });
  });

  it('uses implicit TLS on port 465', () => {
    const config = getSmtpConfig({ ...production, SMTP_PORT: '465' });
    expect(config.port).toBe(465);
    expect(config.secure).toBe(true);
    expect(config.requireTLS).toBe(false);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'])(
    'throws in production when %s is missing or empty',
    (name) => {
      expect(() => getSmtpConfig({ ...production, [name]: undefined })).toThrow(
        `${name} must be set in production`,
      );
      expect(() => getSmtpConfig({ ...production, [name]: '' })).toThrow(
        `${name} must be set in production`,
      );
    },
  );

  it.each(['0', '-1', 'abc', '70000'])('rejects SMTP_PORT %j', (port) => {
    expect(() => getSmtpConfig({ ...production, SMTP_PORT: port })).toThrow(
      /SMTP_PORT must be/,
    );
  });

  it('rejects a password with surrounding whitespace without echoing it', () => {
    let message = '';
    try {
      getSmtpConfig({ ...production, SMTP_PASSWORD: ' relay-password-value' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe('SMTP_PASSWORD must not start or end with whitespace');
  });

  it('rejects an SMTP_FROM without an email address', () => {
    expect(() =>
      getSmtpConfig({ ...production, SMTP_FROM: 'SF-Manager' }),
    ).toThrow('SMTP_FROM must contain an email address');
  });

  it('defaults to a local catcher (Mailpit) outside production when SMTP_HOST is unset', () => {
    expect(getSmtpConfig({ NODE_ENV: 'development' })).toEqual({
      host: 'localhost',
      port: 1025,
      secure: false,
      requireTLS: false,
      auth: null,
      from: 'SF-Manager <no-reply@sf-manager.local>',
    });
  });

  it('ignores the other SMTP values outside production when SMTP_HOST is unset', () => {
    expect(
      getSmtpConfig({
        NODE_ENV: 'development',
        SMTP_PORT: 'abc',
        SMTP_USER: 'relay-user',
      }),
    ).toEqual(getSmtpConfig({ NODE_ENV: 'development' }));
  });

  it('uses the given host without credentials outside production', () => {
    expect(
      getSmtpConfig({
        NODE_ENV: 'test',
        SMTP_HOST: 'mailpit',
        SMTP_PORT: '1025',
        SMTP_FROM: 'Test <test@example.com>',
      }),
    ).toEqual({
      host: 'mailpit',
      port: 1025,
      secure: false,
      requireTLS: false,
      auth: null,
      from: 'Test <test@example.com>',
    });
  });

  it.each([
    { SMTP_USER: 'relay-user', SMTP_PASSWORD: undefined },
    { SMTP_USER: undefined, SMTP_PASSWORD: 'relay-password-value' },
  ])(
    'requires SMTP_USER and SMTP_PASSWORD together outside production (%j)',
    (auth) => {
      expect(() =>
        getSmtpConfig({
          NODE_ENV: 'development',
          SMTP_HOST: 'mailpit',
          ...auth,
        }),
      ).toThrow('SMTP_USER and SMTP_PASSWORD must be set together');
    },
  );
});
