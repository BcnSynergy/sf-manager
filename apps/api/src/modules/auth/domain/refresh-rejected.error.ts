// TD-5: a refresh token that cannot be exchanged. The reason is for logs and
// tests only; the HTTP answer is the same bare 401 for every reason.
export type RefreshRejectionReason =
  'unknown' | 'revoked' | 'expired' | 'reused';

export class RefreshRejectedError extends Error {
  constructor(readonly reason: RefreshRejectionReason) {
    super(`Refresh token rejected: ${reason}`);
    this.name = 'RefreshRejectedError';
  }
}
