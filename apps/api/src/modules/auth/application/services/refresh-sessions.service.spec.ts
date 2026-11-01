import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { RefreshRejectedError } from '../../domain/refresh-rejected.error';
import type { OpaqueTokenGenerator } from '../ports/opaque-token-generator.port';
import { InMemoryRefreshTokenStore } from '../use-cases/testing/in-memory-refresh-token-store';
import type { RefreshTokenPolicy } from './refresh-token-policy';
import { RefreshSessionsService } from './refresh-sessions.service';

const SECOND = 1000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// TD-5 S5 defaults: "8 h inactiv. / 7 d máx.", plus the S4 grace window.
const policy: RefreshTokenPolicy = {
  idleTtlMs: 8 * HOUR,
  absoluteTtlMs: 7 * DAY,
  reuseGraceMs: 10 * SECOND,
};

class FakeClock implements Clock {
  current = new Date('2026-11-01T08:00:00.000Z');
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

class SequentialIds implements IdGenerator {
  private next = 0;
  generate(): string {
    this.next += 1;
    return `id-${this.next}`;
  }
}

class FakeTokens implements OpaqueTokenGenerator {
  private next = 0;
  generate(): string {
    this.next += 1;
    return `token-${this.next}`;
  }
  hash(token: string): string {
    return `hash(${token})`;
  }
}

function setup() {
  const clock = new FakeClock();
  const store = new InMemoryRefreshTokenStore();
  const sessions = new RefreshSessionsService(
    store,
    new FakeTokens(),
    new SequentialIds(),
    clock,
    policy,
  );
  return { clock, store, sessions };
}

async function rejection(
  promise: Promise<unknown>,
): Promise<RefreshRejectedError> {
  const error = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(RefreshRejectedError);
  return error as RefreshRejectedError;
}

describe('RefreshSessionsService', () => {
  describe('start', () => {
    it('starts a family whose token lives 8 hours, and stores only its hash', async () => {
      const { clock, store, sessions } = setup();
      const start = clock.now();

      const issued = await sessions.start('user-1');

      expect(issued.token).toBe('token-1');
      expect(issued.expiresAt).toEqual(new Date(start.getTime() + 8 * HOUR));
      const [stored] = [...store.tokens.values()];
      expect(stored).toEqual({
        id: 'id-2',
        tokenHash: 'hash(token-1)',
        familyId: 'id-1',
        userId: 'user-1',
        createdAt: start,
        expiresAt: new Date(start.getTime() + 8 * HOUR),
        familyExpiresAt: new Date(start.getTime() + 7 * DAY),
        rotatedAt: null,
        revokedAt: null,
      });
      expect(JSON.stringify(stored)).not.toContain('"token-1"');
    });
  });

  describe('rotate', () => {
    it('consumes the token and issues the next one in the same family, sliding the idle timeout', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      clock.advance(2 * HOUR);

      const next = await sessions.rotate(first.token);

      expect(next.userId).toBe('user-1');
      expect(next.token).toBe('token-2');
      expect(next.token).not.toBe(first.token);
      expect(next.expiresAt).toEqual(
        new Date(clock.now().getTime() + 8 * HOUR),
      );
      const consumed = await store.findByHash('hash(token-1)');
      expect(consumed?.rotatedAt).toEqual(clock.now());
      const issued = await store.findByHash('hash(token-2)');
      expect(issued?.familyId).toBe(consumed?.familyId);
      expect(issued?.familyExpiresAt).toEqual(consumed?.familyExpiresAt);
    });

    it('rejects an unknown token', async () => {
      const { sessions } = setup();

      const error = await rejection(sessions.rotate('never-issued'));

      expect(error.reason).toBe('unknown');
    });

    it('rejects a token not refreshed for 8 hours (idle timeout)', async () => {
      const { clock, sessions } = setup();
      const first = await sessions.start('user-1');
      clock.advance(8 * HOUR);

      const error = await rejection(sessions.rotate(first.token));

      expect(error.reason).toBe('expired');
    });

    it('accepts a token just before its idle timeout', async () => {
      const { clock, sessions } = setup();
      const first = await sessions.start('user-1');
      clock.advance(8 * HOUR - 1);

      await expect(sessions.rotate(first.token)).resolves.toMatchObject({
        userId: 'user-1',
      });
    });

    it('caps the family at 7 days after login, however often it is refreshed (absolute maximum)', async () => {
      const { clock, sessions } = setup();
      const login = clock.now();
      let current = await sessions.start('user-1');

      // Refresh every 7 hours: always inside the idle timeout.
      while (clock.now().getTime() + 7 * HOUR < login.getTime() + 7 * DAY) {
        clock.advance(7 * HOUR);
        current = await sessions.rotate(current.token);
      }
      // The last token cannot outlive the family.
      expect(current.expiresAt).toEqual(new Date(login.getTime() + 7 * DAY));

      clock.current = new Date(login.getTime() + 7 * DAY);
      const error = await rejection(sessions.rotate(current.token));

      expect(error.reason).toBe('expired');
    });

    it('revokes the whole family when a rotated token is reused after the grace window', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      const second = await sessions.rotate(first.token);
      clock.advance(10 * SECOND + 1);

      const reuse = await rejection(sessions.rotate(first.token));

      expect(reuse.reason).toBe('reused');
      const latest = await store.findByHash('hash(token-2)');
      expect(latest?.revokedAt).toEqual(clock.now());
      const legit = await rejection(sessions.rotate(second.token));
      expect(legit.reason).toBe('revoked');
    });

    it('still revokes the family when the reused token has itself expired', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      clock.advance(7 * HOUR);
      await sessions.rotate(first.token);
      clock.advance(2 * HOUR);

      const reuse = await rejection(sessions.rotate(first.token));

      expect(reuse.reason).toBe('reused');
      expect((await store.findByHash('hash(token-2)'))?.revokedAt).toEqual(
        clock.now(),
      );
    });

    it('treats a rotated token presented within the grace window as a concurrent refresh, without revoking', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      const fromTabA = await sessions.rotate(first.token);
      clock.advance(10 * SECOND);

      const fromTabB = await sessions.rotate(first.token);

      expect(fromTabB.userId).toBe('user-1');
      expect(fromTabB.token).not.toBe(fromTabA.token);
      for (const token of store.tokens.values()) {
        expect(token.revokedAt).toBeNull();
      }
      await expect(sessions.rotate(fromTabA.token)).resolves.toMatchObject({
        userId: 'user-1',
      });
      await expect(sessions.rotate(fromTabB.token)).resolves.toMatchObject({
        userId: 'user-1',
      });
    });

    it('still issues a token when another request consumed it first (lost the atomic race)', async () => {
      const { store, sessions } = setup();
      const first = await sessions.start('user-1');
      jest.spyOn(store, 'markRotated').mockResolvedValueOnce(false);

      const next = await sessions.rotate(first.token);

      expect(next.userId).toBe('user-1');
      expect(
        [...store.tokens.values()].every((token) => token.revokedAt === null),
      ).toBe(true);
    });

    it('rejects a token from a revoked family', async () => {
      const { sessions } = setup();
      const first = await sessions.start('user-1');
      await sessions.revoke(first.token);

      const error = await rejection(sessions.rotate(first.token));

      expect(error.reason).toBe('revoked');
    });
  });

  describe('revoke', () => {
    it('revokes every token of the family', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      const second = await sessions.rotate(first.token);

      await sessions.revoke(second.token);

      for (const token of store.tokens.values()) {
        expect(token.revokedAt).toEqual(clock.now());
      }
    });

    it('ignores an unknown token', async () => {
      const { store, sessions } = setup();
      await sessions.start('user-1');

      await expect(sessions.revoke('never-issued')).resolves.toBeUndefined();
      expect([...store.tokens.values()][0].revokedAt).toBeNull();
    });
  });

  describe('deleteExpired', () => {
    it('removes the tokens whose expiry has passed', async () => {
      const { clock, store, sessions } = setup();
      await sessions.start('user-1');
      clock.advance(8 * HOUR + 1);
      await sessions.start('user-2');

      await sessions.deleteExpired();

      expect([...store.tokens.values()].map((token) => token.userId)).toEqual([
        'user-2',
      ]);
    });
  });
});
