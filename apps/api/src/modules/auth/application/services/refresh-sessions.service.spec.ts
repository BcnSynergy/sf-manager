import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { RefreshRejectedError } from '../../domain/refresh-rejected.error';
import type { OpaqueTokenGenerator } from '../ports/opaque-token-generator.port';
import { InMemoryRefreshTokenStore } from './testing/in-memory-refresh-token-store';
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
        graceUsedAt: null,
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

    it('allows only one grace exchange per consumed token: a third concurrent refresh is turned away without revoking', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      const fromTabA = await sessions.rotate(first.token);
      clock.advance(2 * SECOND);
      const fromTabB = await sessions.rotate(first.token);
      clock.advance(2 * SECOND);

      const fromTabC = await rejection(sessions.rotate(first.token));

      expect(fromTabC.reason).toBe('superseded');
      // The login token plus one successor each for tabs A and B: the turned
      // away request stored nothing.
      expect(store.tokens.size).toBe(3);
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

    it('still revokes the family when a token whose grace was spent comes back after the window', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      await sessions.rotate(first.token);
      await sessions.rotate(first.token);
      clock.advance(10 * SECOND + 1);

      const error = await rejection(sessions.rotate(first.token));

      expect(error.reason).toBe('reused');
      for (const token of store.tokens.values()) {
        expect(token.revokedAt).toEqual(clock.now());
      }
    });

    it('spends the grace exchange when another request consumed the token first (lost the atomic race)', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      // The rotation exchange loses; the grace exchange that follows is real.
      jest.spyOn(store, 'exchange').mockResolvedValueOnce(false);

      const next = await sessions.rotate(first.token);

      expect(next.userId).toBe('user-1');
      const consumed = await store.findByHash('hash(token-1)');
      expect(consumed?.graceUsedAt).toEqual(clock.now());
      expect(
        [...store.tokens.values()].every((token) => token.revokedAt === null),
      ).toBe(true);
    });

    it('turns away a lost race whose grace exchange is already spent, without revoking', async () => {
      const { sessions, store } = setup();
      const first = await sessions.start('user-1');
      jest
        .spyOn(store, 'exchange')
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const error = await rejection(sessions.rotate(first.token));

      expect(error.reason).toBe('superseded');
      expect([...store.tokens.values()][0].revokedAt).toBeNull();
      expect(store.tokens.size).toBe(1);
    });

    it('rejects a token that joined its family after the family was revoked (logout racing a refresh)', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      const familyId = [...store.tokens.values()][0].familyId;
      await sessions.revoke(first.token);
      // What a refresh that read the family before the revoke still writes.
      await store.create({
        id: 'late',
        tokenHash: 'hash(late-token)',
        familyId,
        userId: 'user-1',
        createdAt: clock.now(),
        expiresAt: new Date(clock.now().getTime() + 8 * HOUR),
        familyExpiresAt: new Date(clock.now().getTime() + 7 * DAY),
      });

      const error = await rejection(sessions.rotate('late-token'));

      expect(error.reason).toBe('revoked');
    });

    it('leaves the token unconsumed when its successor cannot be stored, so a later retry is a normal refresh', async () => {
      const { clock, store, sessions } = setup();
      const first = await sessions.start('user-1');
      jest
        .spyOn(store, 'create')
        .mockRejectedValueOnce(new Error('connection lost'));

      await expect(sessions.rotate(first.token)).rejects.toThrow(
        'connection lost',
      );

      expect((await store.findByHash('hash(token-1)'))?.rotatedAt).toBeNull();
      clock.advance(60 * SECOND);
      await expect(sessions.rotate(first.token)).resolves.toMatchObject({
        userId: 'user-1',
      });
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
    it('keeps consumed tokens until their family expires, so a late reuse is still detected', async () => {
      const { clock, sessions } = setup();
      const first = await sessions.start('user-1');
      clock.advance(7 * HOUR);
      await sessions.rotate(first.token);
      clock.advance(2 * HOUR); // first is past its own 8-hour expiry

      await sessions.deleteExpired();
      const error = await rejection(sessions.rotate(first.token));

      expect(error.reason).toBe('reused');
    });

    it('removes the tokens of families past their 7-day maximum', async () => {
      const { clock, store, sessions } = setup();
      await sessions.start('user-1');
      clock.advance(7 * DAY + 1);
      await sessions.start('user-2');

      await sessions.deleteExpired();

      expect([...store.tokens.values()].map((token) => token.userId)).toEqual([
        'user-2',
      ]);
    });
  });
});
