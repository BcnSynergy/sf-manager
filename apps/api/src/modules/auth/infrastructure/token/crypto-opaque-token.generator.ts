import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OpaqueTokenGenerator } from '../../application/ports/opaque-token-generator.port';

// TD-5: 256 random bits, URL-safe so the value is cookie-safe as is. SHA-256
// is enough for the stored hash (no salt or slow hash needed): the input is
// a high-entropy random secret, not a password.
@Injectable()
export class CryptoOpaqueTokenGenerator implements OpaqueTokenGenerator {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
