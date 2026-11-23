import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { UuidV7IdGenerator } from '../../../../shared/infrastructure/id/uuid-v7.id-generator';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { PrismaUserRepository } from '../../../users/infrastructure/persistence/prisma-user.repository';
import { User } from '../../../users/domain/user.entity';
import { PrismaCommunityRepository } from '../../../community/infrastructure/persistence/prisma-community.repository';
import { Community } from '../../../community/domain/community.entity';
import { PrismaReviewTemplateRepository } from '../../../review-template/infrastructure/persistence/prisma-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { PrismaInspectableElementRepository } from '../../../inspectable-element/infrastructure/persistence/prisma-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { RandomElementCodeGenerator } from '../../../inspectable-element/infrastructure/code/random-element-code.generator';
import { ReviewSession } from '../../domain/review-session.entity';
import type { ReviewPhoto } from '../../domain/review-photo';
import { PrismaReviewSessionRepository } from './prisma-review-session.repository';
import { PrismaReviewPhotoRepository } from './prisma-review-photo.repository';

const idGenerator = new UuidV7IdGenerator();
const codeGenerator = new RandomElementCodeGenerator();

// EN-164 against a real Postgres (hermetic database per run): the
// per-element limit under concurrent uploads (Risk item 4), the draft-only
// backstop, scoping by session, the cascade on discard and the FK rules.
describe('PrismaReviewPhotoRepository (integration)', () => {
  let prisma: PrismaService;
  let otherPrisma: PrismaService;
  let photos: PrismaReviewPhotoRepository;
  let otherPhotos: PrismaReviewPhotoRepository;
  let sessions: PrismaReviewSessionRepository;
  let communities: PrismaCommunityRepository;
  let templates: PrismaReviewTemplateRepository;
  let users: PrismaUserRepository;
  let elements: PrismaInspectableElementRepository;
  let communityId: string;
  let templateId: string;
  let performedById: string;

  beforeAll(async () => {
    // Two independent connections so concurrent adds genuinely overlap.
    prisma = new PrismaService();
    otherPrisma = new PrismaService();
    await prisma.$connect();
    await otherPrisma.$connect();
    photos = new PrismaReviewPhotoRepository(prisma);
    otherPhotos = new PrismaReviewPhotoRepository(otherPrisma);
    sessions = new PrismaReviewSessionRepository(prisma);
    communities = new PrismaCommunityRepository(prisma);
    templates = new PrismaReviewTemplateRepository(prisma);
    users = new PrismaUserRepository(prisma);
    elements = new PrismaInspectableElementRepository(prisma);

    communityId = idGenerator.generate();
    await communities.create(
      new Community({
        id: communityId,
        name: `photos-${randomUUID()}`,
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
        deletedAt: null,
      }),
    );
    performedById = idGenerator.generate();
    await users.create(
      new User({
        id: performedById,
        email: `photos-${randomUUID()}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    // The run database is shared with the other integration suites (one
    // active template and at most one draft per lineage), so this follows
    // prisma-review-session.repository.integration.spec.ts: clear stray
    // drafts (they never have snapshot rows), retire the lineage's active
    // row, then flip a fresh draft to active with the next version, since
    // this suite only needs an `active` FK target, not a question snapshot.
    await prisma.reviewTemplate.deleteMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        status: 'draft',
      },
    });
    templateId = idGenerator.generate();
    await templates.create(
      new ReviewTemplate({
        id: templateId,
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        name: `photos-${randomUUID()}`,
        version: null,
        status: 'draft',
        draftQuestionIds: [],
        createdAt: new Date(),
        deletedAt: null,
      }),
    );
    await prisma.reviewTemplate.updateMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        status: 'active',
      },
      data: { status: 'retired' },
    });
    const priorVersions = await prisma.reviewTemplate.findMany({
      where: {
        elementType: 'EXTINGUISHER',
        frequency: 'QUARTERLY',
        version: { not: null },
      },
      select: { version: true },
    });
    await prisma.reviewTemplate.update({
      where: { id: templateId },
      data: {
        status: 'active',
        version:
          Math.max(0, ...priorVersions.map((row) => row.version ?? 0)) + 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await otherPrisma.$disconnect();
  });

  const createElement = async (): Promise<string> => {
    const id = idGenerator.generate();
    await elements.create(
      new InspectableElement({
        id,
        communityId,
        elementType: 'EXTINGUISHER',
        name: `photos-${randomUUID()}`,
        description: null,
        location: 'Ground floor',
        installedAt: new Date(),
        serialNumber: null,
        deletedAt: null,
        code: codeGenerator.generate(),
        deactivatedAt: null,
      }),
    );
    return id;
  };

  // A fresh performer per session: at most one open draft per (community,
  // template, performer).
  const createDraft = async (): Promise<string> => {
    const userId = idGenerator.generate();
    await users.create(
      new User({
        id: userId,
        email: `photos-${randomUUID()}@example.com`,
        passwordHash: 'argon2id$hash',
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    const id = idGenerator.generate();
    await sessions.create(
      new ReviewSession({
        id,
        communityId,
        templateId,
        performedById: userId,
        status: 'draft',
        startedAt: new Date(),
        completedAt: null,
      }),
    );
    return id;
  };

  const photo = (
    reviewSessionId: string,
    inspectableElementId: string,
    createdAt = new Date(),
    id = idGenerator.generate(),
  ): ReviewPhoto => {
    return {
      id,
      reviewSessionId,
      inspectableElementId,
      storageKey: `review-photos/${id}.jpg`,
      sizeBytes: 123,
      createdAt,
    };
  };

  it('stores a photo on a draft and reads it back scoped to its session', async () => {
    const sessionId = await createDraft();
    const otherSessionId = await createDraft();
    const elementId = await createElement();
    const stored = photo(sessionId, elementId);

    await expect(photos.addToDraft(stored, 3)).resolves.toBe('added');

    await expect(photos.findInSession(sessionId, stored.id)).resolves.toEqual(
      stored,
    );
    await expect(
      photos.findInSession(otherSessionId, stored.id),
    ).resolves.toBeNull();
  });

  it('lists an element photos oldest first, ties broken by id', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    const otherElementId = await createElement();
    const older = photo(sessionId, elementId, new Date('2026-01-01T00:00:00Z'));
    const newer = photo(sessionId, elementId, new Date('2026-01-02T00:00:00Z'));
    // Fixed ids: the order of equal timestamps is the id's, not the
    // generator's (UUIDv7 ids made in one millisecond are not ordered).
    const tieA = photo(
      sessionId,
      elementId,
      new Date('2026-01-03T00:00:00Z'),
      '0192f0c0-0000-7000-8000-00000000000a',
    );
    const tieB = photo(
      sessionId,
      elementId,
      new Date('2026-01-03T00:00:00Z'),
      '0192f0c0-0000-7000-8000-00000000000b',
    );
    await photos.addToDraft(newer, 5);
    await photos.addToDraft(tieB, 5);
    await photos.addToDraft(older, 5);
    await photos.addToDraft(tieA, 5);
    await photos.addToDraft(photo(sessionId, otherElementId), 5);

    const listed = await photos.listForElement(sessionId, elementId);

    expect(listed.map((row) => row.id)).toEqual([
      older.id,
      newer.id,
      tieA.id,
      tieB.id,
    ]);
  });

  it('lists every photo of a session across its elements, oldest first, ties broken by id, and none of another session', async () => {
    const sessionId = await createDraft();
    const otherSessionId = await createDraft();
    const elementId = await createElement();
    const otherElementId = await createElement();
    const first = photo(
      sessionId,
      otherElementId,
      new Date('2026-02-01T00:00:00Z'),
    );
    const tieC = photo(
      sessionId,
      elementId,
      new Date('2026-02-02T00:00:00Z'),
      '0192f0c0-0000-7000-8000-00000000000c',
    );
    const tieD = photo(
      sessionId,
      otherElementId,
      new Date('2026-02-02T00:00:00Z'),
      '0192f0c0-0000-7000-8000-00000000000d',
    );
    await photos.addToDraft(tieD, 3);
    await photos.addToDraft(tieC, 3);
    await photos.addToDraft(first, 3);
    await photos.addToDraft(photo(otherSessionId, elementId), 3);

    const listed = await photos.listForSession(sessionId);

    expect(listed).toEqual([first, tieC, tieD]);
    await expect(
      photos.listForSession(idGenerator.generate()),
    ).resolves.toEqual([]);
  });

  it('refuses the 4th photo of an element with limit_reached and counts per element', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    const otherElementId = await createElement();
    for (let i = 0; i < 3; i++) {
      await expect(
        photos.addToDraft(photo(sessionId, elementId), 3),
      ).resolves.toBe('added');
    }

    await expect(
      photos.addToDraft(photo(sessionId, elementId), 3),
    ).resolves.toBe('limit_reached');
    await expect(
      photos.addToDraft(photo(sessionId, otherElementId), 3),
    ).resolves.toBe('added');

    expect(
      await prisma.reviewPhoto.count({
        where: { reviewSessionId: sessionId, inspectableElementId: elementId },
      }),
    ).toBe(3);
  });

  it('keeps exactly 3 rows when 8 uploads of one element race on two connections', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 === 0 ? photos : otherPhotos).addToDraft(
          photo(sessionId, elementId),
          3,
        ),
      ),
    );

    expect(results.filter((result) => result === 'added')).toHaveLength(3);
    expect(results.filter((result) => result === 'limit_reached')).toHaveLength(
      5,
    );
    expect(
      await prisma.reviewPhoto.count({
        where: { reviewSessionId: sessionId, inspectableElementId: elementId },
      }),
    ).toBe(3);
  });

  it('refuses add and delete on a completed session and keeps its rows', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    const stored = photo(sessionId, elementId);
    await photos.addToDraft(stored, 3);
    await expect(sessions.complete(sessionId, new Date())).resolves.toBe(true);

    await expect(
      photos.addToDraft(photo(sessionId, elementId), 3),
    ).resolves.toBe('not_editable');
    await expect(photos.deleteFromDraft(sessionId, stored.id)).resolves.toEqual(
      { outcome: 'not_editable' },
    );

    expect(
      await prisma.reviewPhoto.count({ where: { reviewSessionId: sessionId } }),
    ).toBe(1);
  });

  it('refuses add for a session that does not exist', async () => {
    const elementId = await createElement();
    await expect(
      photos.addToDraft(photo(idGenerator.generate(), elementId), 3),
    ).resolves.toBe('not_editable');
  });

  it('deletes a photo of a draft and returns its key; unknown or foreign ids are not_found', async () => {
    const sessionId = await createDraft();
    const otherSessionId = await createDraft();
    const elementId = await createElement();
    const stored = photo(sessionId, elementId);
    await photos.addToDraft(stored, 3);

    await expect(
      photos.deleteFromDraft(otherSessionId, stored.id),
    ).resolves.toEqual({ outcome: 'not_found' });
    await expect(
      photos.deleteFromDraft(sessionId, idGenerator.generate()),
    ).resolves.toEqual({ outcome: 'not_found' });
    expect(await prisma.reviewPhoto.count({ where: { id: stored.id } })).toBe(
      1,
    );

    await expect(photos.deleteFromDraft(sessionId, stored.id)).resolves.toEqual(
      { outcome: 'deleted', storageKey: stored.storageKey },
    );
    expect(await prisma.reviewPhoto.count({ where: { id: stored.id } })).toBe(
      0,
    );
  });

  it('removes the rows with a discarded draft (ON DELETE CASCADE)', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    await photos.addToDraft(photo(sessionId, elementId), 3);
    await photos.addToDraft(photo(sessionId, elementId), 3);

    await expect(sessions.discardDraft(sessionId)).resolves.toBe(true);

    expect(
      await prisma.reviewPhoto.count({ where: { reviewSessionId: sessionId } }),
    ).toBe(0);
  });

  it('discards a draft returning the keys of its photos, rows and session gone', async () => {
    const sessionId = await createDraft();
    const otherSessionId = await createDraft();
    const elementId = await createElement();
    const first = photo(sessionId, elementId);
    const second = photo(sessionId, elementId);
    const foreign = photo(otherSessionId, elementId);
    for (const row of [first, second, foreign]) {
      await photos.addToDraft(row, 3);
    }

    const result = await photos.discardDraftWithPhotoKeys(sessionId);

    expect(result.outcome).toBe('discarded');
    expect(
      result.outcome === 'discarded' ? [...result.storageKeys].sort() : [],
    ).toEqual([first.storageKey, second.storageKey].sort());
    expect(await prisma.reviewSession.count({ where: { id: sessionId } })).toBe(
      0,
    );
    expect(
      await prisma.reviewPhoto.count({ where: { reviewSessionId: sessionId } }),
    ).toBe(0);
    expect(await prisma.reviewPhoto.count({ where: { id: foreign.id } })).toBe(
      1,
    );
  });

  it('refuses to discard a completed or unknown session and keeps its photos', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    await photos.addToDraft(photo(sessionId, elementId), 3);
    await sessions.complete(sessionId, new Date());

    await expect(photos.discardDraftWithPhotoKeys(sessionId)).resolves.toEqual({
      outcome: 'not_editable',
    });
    await expect(
      photos.discardDraftWithPhotoKeys(idGenerator.generate()),
    ).resolves.toEqual({ outcome: 'not_editable' });
    expect(
      await prisma.reviewPhoto.count({ where: { reviewSessionId: sessionId } }),
    ).toBe(1);
  });

  // EN-164 S4: an add racing a discard. Every add that committed must have
  // its key in the keys the discard returned (so its file is deleted); an add
  // that lost the race is refused. Repeated, because the interleaving is
  // timing-dependent.
  it('never leaves a committed photo key out of a racing discard', async () => {
    for (let round = 0; round < 15; round++) {
      const sessionId = await createDraft();
      const elementId = await createElement();
      const adds = Array.from({ length: 3 }, () => photo(sessionId, elementId));

      const [discard, ...added] = await Promise.all([
        photos.discardDraftWithPhotoKeys(sessionId),
        ...adds.map((row) => otherPhotos.addToDraft(row, 3)),
      ]);

      expect(discard.outcome).toBe('discarded');
      const returned =
        discard.outcome === 'discarded' ? discard.storageKeys : [];
      adds.forEach((row, index) => {
        if (added[index] === 'added') {
          expect(returned).toContain(row.storageKey);
        } else {
          expect(added[index]).toBe('not_editable');
        }
      });
      expect(
        await prisma.reviewPhoto.count({
          where: { reviewSessionId: sessionId },
        }),
      ).toBe(0);
    }
  });

  // S-3: complete() writes the session row the add locks, so an add either
  // committed first (its row is there) or is refused; no photo lands on a
  // completed session after the fact.
  it('keeps add and complete consistent when they race', async () => {
    for (let round = 0; round < 10; round++) {
      const sessionId = await createDraft();
      const elementId = await createElement();
      const adds = Array.from({ length: 3 }, () => photo(sessionId, elementId));

      const [completed, ...added] = await Promise.all([
        sessions.complete(sessionId, new Date()),
        ...adds.map((row) => otherPhotos.addToDraft(row, 3)),
      ]);

      expect(completed).toBe(true);
      const rows = await prisma.reviewPhoto.findMany({
        where: { reviewSessionId: sessionId },
      });
      expect(rows.map((row) => row.id).sort()).toEqual(
        adds
          .filter((_, index) => added[index] === 'added')
          .map((row) => row.id)
          .sort(),
      );
      // Once completed, nothing more can land.
      await expect(
        photos.addToDraft(photo(sessionId, elementId), 3),
      ).resolves.toBe('not_editable');
    }
  });

  // EN-222: the orphan file sweep keeps every key a row references, in any
  // session, draft or completed.
  it('reports which storage keys a row references, in draft and completed sessions', async () => {
    const draftId = await createDraft();
    const completedId = await createDraft();
    const elementId = await createElement();
    const inDraft = photo(draftId, elementId);
    const inCompleted = photo(completedId, elementId);
    await photos.addToDraft(inDraft, 3);
    await photos.addToDraft(inCompleted, 3);
    await expect(sessions.complete(completedId, new Date())).resolves.toBe(
      true,
    );
    const orphanKey = `review-photos/${idGenerator.generate()}.jpg`;

    const referenced = await photos.findReferencedStorageKeys([
      inDraft.storageKey,
      orphanKey,
      inCompleted.storageKey,
    ]);

    expect([...referenced].sort()).toEqual(
      [inDraft.storageKey, inCompleted.storageKey].sort(),
    );
    await expect(photos.findReferencedStorageKeys([])).resolves.toEqual(
      new Set(),
    );
    await expect(photos.hasAnyPhoto()).resolves.toBe(true);
  });

  it('keeps the element FK as RESTRICT: an element with photos cannot be hard-deleted', async () => {
    const sessionId = await createDraft();
    const elementId = await createElement();
    await photos.addToDraft(photo(sessionId, elementId), 3);

    await expect(
      prisma.inspectableElement.delete({ where: { id: elementId } }),
    ).rejects.toThrow();
  });
});
