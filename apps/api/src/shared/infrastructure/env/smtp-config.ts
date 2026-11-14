import { isProduction } from './is-production';
import { parsePositiveInteger } from './positive-integer';

// password-reset S2 (ADR-018): outgoing email goes through any SMTP relay
// (Brevo in production). Production must set every value, so a stack that
// cannot send email fails to start instead of failing on the first reset
// request. Outside production an unset SMTP_HOST means the local catcher
// from docker-compose.yml (Mailpit), with no credentials. Messages never
// include the password.
export interface SmtpConfig {
  host: string;
  port: number;
  // Implicit TLS (port 465); otherwise the connection upgrades with STARTTLS.
  secure: boolean;
  // Production never sends credentials over a connection that did not
  // upgrade to TLS.
  requireTLS: boolean;
  auth: { user: string; pass: string } | null;
  from: string;
}

const DEV_DEFAULT: SmtpConfig = {
  host: 'localhost',
  port: 1025,
  secure: false,
  requireTLS: false,
  auth: null,
  from: 'SF-Manager <no-reply@sf-manager.local>',
};

const MAX_PORT = 65535;

function present(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

export function getSmtpConfig(env: NodeJS.ProcessEnv): SmtpConfig {
  const production = isProduction(env.NODE_ENV);
  const host = present(env.SMTP_HOST);
  if (host === undefined && !production) {
    return { ...DEV_DEFAULT };
  }

  if (production) {
    for (const name of [
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
    ]) {
      if (present(env[name]) === undefined) {
        throw new Error(`${name} must be set in production`);
      }
    }
  }

  const port = parsePositiveInteger(
    'SMTP_PORT',
    env.SMTP_PORT,
    production ? 587 : DEV_DEFAULT.port,
    MAX_PORT,
  );
  const user = present(env.SMTP_USER);
  const pass = present(env.SMTP_PASSWORD);
  if ((user === undefined) !== (pass === undefined)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be set together');
  }
  if (pass !== undefined && pass !== pass.trim()) {
    throw new Error('SMTP_PASSWORD must not start or end with whitespace');
  }
  const from = present(env.SMTP_FROM) ?? DEV_DEFAULT.from;
  if (!/[^\s<>@]+@[^\s<>@]+/.test(from)) {
    throw new Error('SMTP_FROM must contain an email address');
  }

  const secure = port === 465;
  return {
    host: host as string,
    port,
    secure,
    requireTLS: production && !secure,
    auth: user !== undefined && pass !== undefined ? { user, pass } : null,
    from,
  };
}
