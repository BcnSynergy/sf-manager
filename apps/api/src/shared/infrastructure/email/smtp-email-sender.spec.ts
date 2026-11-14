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
  it('maps the config to an authenticated STARTTLS connection', () => {
    expect(smtpTransportOptions(config)).toEqual({
      host: 'smtp-relay.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'relay-user', pass: 'relay-password-value' },
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

  it('rejects when the relay rejects the message', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('550 rejected'));
    const sender = new SmtpEmailSender({ sendMail }, config.from);

    await expect(
      sender.send({ to: 'user@example.com', subject: 'S', text: 'T' }),
    ).rejects.toThrow('550 rejected');
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
