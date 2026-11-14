import type { SmtpConfig } from '../env/smtp-config';
import { SmtpEmailSender, smtpTransportOptions } from './smtp-email-sender';

const config: SmtpConfig = {
  host: 'smtp-relay.example.com',
  port: 587,
  secure: false,
  requireTLS: true,
  auth: { user: 'relay-user', pass: 'relay-password-value' },
  from: 'SF-Manager <no-reply@example.com>',
};

describe('smtpTransportOptions', () => {
  it('maps the config to an authenticated STARTTLS connection with short timeouts', () => {
    expect(smtpTransportOptions(config)).toEqual({
      host: 'smtp-relay.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'relay-user', pass: 'relay-password-value' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it('leaves auth out when the relay needs no credentials', () => {
    expect(smtpTransportOptions({ ...config, auth: null })).not.toHaveProperty(
      'auth',
    );
  });
});

describe('SmtpEmailSender', () => {
  it('sends the message from the configured sender', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'id' });
    const sender = new SmtpEmailSender({ sendMail }, config.from);

    await sender.send({
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Plain body',
      html: '<p>HTML body</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'SF-Manager <no-reply@example.com>',
      to: 'user@example.com',
      subject: 'Subject',
      text: 'Plain body',
      html: '<p>HTML body</p>',
    });
  });

  it('logs and rejects when the relay rejects the message', async () => {
    // nodemailer's messages can quote the recipient, so only the error
    // codes are logged.
    const relayError = Object.assign(
      new Error('550 <user@example.com>: Recipient address rejected'),
      { code: 'EENVELOPE', responseCode: 550 },
    );
    const sendMail = jest.fn().mockRejectedValue(relayError);
    const warn = jest.fn<void, [string]>();
    const sender = new SmtpEmailSender({ sendMail }, config.from, { warn });

    await expect(
      sender.send({
        to: 'user@example.com',
        subject: 'Secret subject',
        text: 'Secret body',
      }),
    ).rejects.toBe(relayError);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Email send failed (code EENVELOPE, SMTP 550)',
    );
  });

  it('delivers through a real nodemailer transport', async () => {
    const sender = SmtpEmailSender.fromTransport(
      { streamTransport: true, buffer: true },
      config.from,
    );
    await expect(
      sender.send({ to: 'user@example.com', subject: 'S', text: 'T' }),
    ).resolves.toBeUndefined();
  });
});
