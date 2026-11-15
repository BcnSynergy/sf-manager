import type {
  EmailMessage,
  EmailSender,
} from '../application/ports/email-sender.port';

// Test double for the EmailSender port: records every message, or rejects
// with `failWith` when set.
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;

  send(message: EmailMessage): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}
