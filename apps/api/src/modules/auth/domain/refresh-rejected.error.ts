// TD-5: a refresh token that cannot be exchanged. The reason is for logs and
// tests only; the HTTP answer is the same bare 401 for every reason.
// 'superseded': a token consumed moment ago whose one grace exchange is
// already spent; turned away without revoking, since it is most likely a
// third tab refreshing at the same time, not a thief.
export type RefreshRejectionReason =
  'unknown' | 'revoked' | 'expired' | 'reused' | 'superseded';

export class RefreshRejectedError extends Error {
  constructor(readonly reason: RefreshRejectionReason) {
    super(`Refresh token rejected: ${reason}`);
    this.name = 'RefreshRejectedError';
  }
}
