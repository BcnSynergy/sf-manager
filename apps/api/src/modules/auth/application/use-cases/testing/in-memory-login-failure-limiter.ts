import type { LoginEmailRateLimitConfig } from '../../../infrastructure/config/login-rate-limit.config';
import type {
  LoginBlock,
  LoginFailureLimiter,
} from '../../ports/login-failure-limiter.port';

interface Counter {
  hits: number;
  windowEndsAt: number;
  blockedUntil: number | null;
}

// Type guard: a true result also narrows blockedUntil to a number.
const isBlocked = (
  counter: Counter,
  now: number,
): counter is Counter & { blockedUntil: number } =>
  counter.blockedUntil !== null && counter.blockedUntil > now;

// Test double for LoginFailureLimiter (login-account-lockout/design.md
// Decision 9). The e2e suites mock PrismaService, so the real adapter cannot
// run there; this fake applies the same rules as PrismaLoginFailureLimiter
// (fixed window anchored on the first failure, block when a failure reaches
// the limit, failures during a block ignored, reset deletes) using Date.now().
// Atomicity under concurrency and the database clock are infrastructure
// guarantees proven only by the adapter's integration spec.
export class InMemoryLoginFailureLimiter implements LoginFailureLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(private readonly config: LoginEmailRateLimitConfig) {}

  getBlock(email: string): Promise<LoginBlock> {
    const now = Date.now();
    const counter = this.counters.get(email);
    if (counter === undefined || !isBlocked(counter, now)) {
      return Promise.resolve({ blocked: false });
    }
    return Promise.resolve({
      blocked: true,
      retryAfterSeconds: Math.ceil((counter.blockedUntil - now) / 1000),
    });
  }

  recordFailure(email: string): Promise<void> {
    const now = Date.now();
    const { maxFailures, windowMs } = this.config;
    const existing = this.counters.get(email);

    if (existing !== undefined && isBlocked(existing, now)) {
      return Promise.resolve();
    }

    const startsNewWindow =
      existing === undefined ||
      existing.blockedUntil !== null ||
      existing.windowEndsAt <= now;
    const hits = startsNewWindow ? 1 : existing.hits + 1;
    this.counters.set(email, {
      hits,
      windowEndsAt: startsNewWindow ? now + windowMs : existing.windowEndsAt,
      blockedUntil: hits >= maxFailures ? now + windowMs : null,
    });
    return Promise.resolve();
  }

  reset(email: string): Promise<void> {
    this.counters.delete(email);
    return Promise.resolve();
  }
}
