import { Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type {
  EmailMessage,
  EmailSender,
} from '../../application/ports/email-sender.port';
import type { SmtpConfig } from '../env/smtp-config';

// The one part of a nodemailer transporter this adapter uses, so tests can
// pass a fake without opening a connection.
export interface MailTransport {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

export interface WarningLogger {
  warn(message: string): void;
}

// nodemailer waits up to 2 minutes to connect and 10 minutes on an idle
// socket by default; a blackholed or stalled relay should fail a send in
// seconds instead.
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

// A string or number error field as text; anything else is not logged.
function scalar(value: unknown, fallback: string): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : fallback;
}

export function smtpTransportOptions(config: SmtpConfig): SmtpTransportOptions {
  const options: SmtpTransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  };
  if (config.auth !== null) {
    options.auth = config.auth;
  }
  return options;
}

// ADR-018: plain SMTP, so any relay works (Brevo in production, Mailpit in
// development). No provider API, stored template or tracking feature is used.
// A failed send is logged here, whoever the caller is, so an expired key or
// an unreachable relay always shows in the API log; only error codes are
// logged, because relay messages can quote the recipient.
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
    private readonly logger: WarningLogger = new Logger('EmailSender'),
  ) {}

  static fromConfig(config: SmtpConfig): SmtpEmailSender {
    return SmtpEmailSender.fromTransport(
      smtpTransportOptions(config),
      config.from,
    );
  }

  // Any nodemailer transport options; tests use its stream transport.
  static fromTransport(
    options: Parameters<typeof createTransport>[0],
    from: string,
  ): SmtpEmailSender {
    return new SmtpEmailSender(createTransport(options) as MailTransport, from);
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      });
    } catch (error) {
      const { code, responseCode } = (error ?? {}) as {
        code?: unknown;
        responseCode?: unknown;
      };
      this.logger.warn(
        `Email send failed (code ${scalar(code, 'unknown')}, SMTP ${scalar(responseCode, 'none')})`,
      );
      throw error;
    }
  }
}
