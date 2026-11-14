// Port (application layer, ADR-002/013; ADR-018): sends one email. Use cases
// build the message, including its translated subject and body, so the
// adapter only delivers it; the SMTP adapter can be pointed at any relay
// without touching them.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  // Rejects when the relay does not accept the message.
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
