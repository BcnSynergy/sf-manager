import { buildPasswordResetEmail } from './password-reset-email';

const LINK = 'https://app.example.com/reset-password#token=abc_DEF-123';

describe('buildPasswordResetEmail', () => {
  it.each([
    ['en', 'Reset your SF-Manager password', '30 minutes', 'did not ask'],
    [
      'es',
      'Restablece tu contraseña de SF-Manager',
      '30 minutos',
      'no lo has pedido',
    ],
    [
      'ca',
      'Restableix la teva contrasenya de SF-Manager',
      '30 minuts',
      'no ho has demanat',
    ],
  ] as const)(
    'writes the %s message with the link, the lifetime and the ignore note, in text and HTML',
    (locale, subject, lifetime, ignoreNote) => {
      const message = buildPasswordResetEmail({
        locale,
        link: LINK,
        lifetimeMinutes: 30,
      });

      expect(message.subject).toBe(subject);
      expect(message.text).toContain(LINK);
      expect(message.text).toContain(lifetime);
      expect(message.text).toContain(ignoreNote);
      expect(message.html).toContain(`href="${LINK}"`);
      expect(message.html).toContain(lifetime);
      expect(message.html).toContain(ignoreNote);
    },
  );

  it("does not address the message: the recipient is the caller's", () => {
    const message = buildPasswordResetEmail({
      locale: 'en',
      link: LINK,
      lifetimeMinutes: 30,
    });

    expect(Object.keys(message).sort()).toEqual(['html', 'subject', 'text']);
  });
});
