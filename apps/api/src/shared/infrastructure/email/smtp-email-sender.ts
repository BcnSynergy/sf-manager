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
}

export function smtpTransportOptions(config: SmtpConfig): SmtpTransportOptions {
  const options: SmtpTransportOptions = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
  };
  if (config.auth !== null) {
    options.auth = config.auth;
  }
  return options;
}

// ADR-018: plain SMTP, so any relay works (Brevo in production, Mailpit in
// development). No provider API, stored template or tracking feature is used.
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
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
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });
  }
}
