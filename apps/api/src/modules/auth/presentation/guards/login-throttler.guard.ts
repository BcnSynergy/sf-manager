import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { toClientKey } from './client-key';

// design.md Decision 2: overrides only the tracker. The library still hashes
// the key and owns counting, blocking and headers. No constructor: Nest
// resolves the inherited ThrottlerGuard parameter metadata.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(toClientKey(req.ip));
  }
}
