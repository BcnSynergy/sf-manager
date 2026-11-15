import type { PasswordResetLocale } from '@sf-manager/validation';
import type { EmailMessage } from '../../../../shared/application/ports/email-sender.port';

// password-reset S2, S6 (ADR-018): the message text lives in code, one entry
// per language the web app offers. The only interpolated values are the link
// (the origin plus a base64url token, so nothing needs HTML escaping) and the
// lifetime (a number). The caller adds the recipient.
export type PasswordResetEmailLocale = PasswordResetLocale;

export interface PasswordResetEmailInput {
  locale: PasswordResetEmailLocale;
  link: string;
  lifetimeMinutes: number;
}

interface Copy {
  subject: string;
  intro: string;
  action: string;
  lifetime: (minutes: number) => string;
  ignore: string;
}

const COPY: Record<PasswordResetEmailLocale, Copy> = {
  en: {
    subject: 'Reset your SF-Manager password',
    intro: 'We received a request to reset your SF-Manager password.',
    action: 'Choose a new password',
    lifetime: (minutes) => `The link expires in ${minutes} minutes.`,
    ignore:
      'If you did not ask for this, you can ignore this email: your password stays as it is.',
  },
  es: {
    subject: 'Restablece tu contraseña de SF-Manager',
    intro:
      'Hemos recibido una solicitud para restablecer tu contraseña de SF-Manager.',
    action: 'Elegir una contraseña nueva',
    lifetime: (minutes) => `El enlace caduca en ${minutes} minutos.`,
    ignore:
      'Si no lo has pedido, puedes ignorar este correo: tu contraseña no cambia.',
  },
  ca: {
    subject: 'Restableix la teva contrasenya de SF-Manager',
    intro:
      'Hem rebut una sol·licitud per restablir la teva contrasenya de SF-Manager.',
    action: 'Triar una contrasenya nova',
    lifetime: (minutes) => `L'enllaç caduca d'aquí a ${minutes} minuts.`,
    ignore:
      'Si no ho has demanat, pots ignorar aquest correu: la teva contrasenya no canvia.',
  },
};

export function buildPasswordResetEmail(
  input: PasswordResetEmailInput,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const copy = COPY[input.locale];
  const lifetime = copy.lifetime(input.lifetimeMinutes);
  const text = [
    copy.intro,
    '',
    `${copy.action}: ${input.link}`,
    '',
    lifetime,
    copy.ignore,
  ].join('\n');
  // Text pieces come from the constants above; the link and the number are
  // the only dynamic values and contain no HTML metacharacters.
  const html = [
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<p><a href="${input.link}">${escapeHtml(copy.action)}</a></p>`,
    `<p>${escapeHtml(lifetime)}</p>`,
    `<p>${escapeHtml(copy.ignore)}</p>`,
  ].join('\n');
  return { subject: copy.subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
