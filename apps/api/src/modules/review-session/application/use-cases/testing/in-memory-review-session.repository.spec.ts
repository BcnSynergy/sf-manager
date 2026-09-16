import { ElementReviewEntry } from '../../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../../domain/question-answer.entity';
import { ReviewSession } from '../../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../../domain/errors/review-session-not-found.error';
import { InMemoryReviewSessionRepository } from './in-memory-review-session.repository';

// Fresh-context review on PR4, finding #C: the port's `upsertEntry` took a
// separate `answers` parameter alongside `entry`, which already carries
// `entry.answers` (ElementReviewEntry.reviewed()/.unreviewed() — the
// domain invariant's only construction paths, design.md Decision 1). The
// two doubles disagreed on which one was authoritative for persistence,
// AND on the missing-session case (this fake silently no-op'd; the Prisma
// adapter would hit a real FK violation and throw). Resolution: `answers`
// was redundant — `entry.answers` is the single source of truth — so the
// port signature dropped that second parameter, and both doubles now throw
// the SAME ReviewSessionNotFoundError for an unknown sessionId.
//
// Phase 5 follow-up (PR4's carried-forward note): the SAME redundancy was
// still present one level up — `entry.reviewSessionId` vs. the separate
// `sessionId` parameter this test used to pass alongside it. There was no
// real caller to notice the two diverging until record-entry.use-case.ts
// (this PR); resolved identically — `entry.reviewSessionId` is now the
// sole source of truth and `upsertEntry` takes `entry` alone.
describe('InMemoryReviewSessionRepository.upsertEntry (review finding #C)', () => {
  function buildSession(
    overrides: Partial<{ status: 'draft' | 'completed' }> = {},
  ) {
    return new ReviewSession({
      id: 'session-1',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: overrides.status ?? 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
  }

  it('persists entry.answers as the authoritative answer set — there is no separate answers parameter', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const session = buildSession();
    repository.seed(session);

    const answer = new QuestionAnswer({
      id: 'answer-1',
      elementReviewEntryId: 'entry-1',
      questionId: 'question-1',
      answer: 'YES',
    });
    const entry = ElementReviewEntry.reviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      answers: [answer],
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await repository.upsertEntry(entry);

    const stored = await repository.findByIdForPerformer('session-1', 'user-1');
    expect(stored?.entries[0].answers).toEqual([answer]);
  });

  // Fresh-context review finding M1: mirrors complete()/discardDraft()'s
  // own `WHERE status='draft'` guard — `false`, not a thrown error, is the
  // fake's contract for "the write lost a concurrency race" (the real
  // Prisma adapter's own DB-level guard makes the same distinction; see
  // prisma-review-session.repository.integration.spec.ts).
  it('returns false instead of writing when the session is not draft (concurrency backstop)', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(buildSession({ status: 'completed' }));

    const entry = ElementReviewEntry.unreviewed({
      id: 'entry-1',
      reviewSessionId: 'session-1',
      inspectableElementId: 'element-1',
      observations: 'race window',
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(repository.upsertEntry(entry)).resolves.toBe(false);
  });

  it('rejects with ReviewSessionNotFoundError for an unknown sessionId, matching the real Prisma adapter instead of silently no-op-ing', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const entry = ElementReviewEntry.unreviewed({
      id: 'entry-1',
      reviewSessionId: 'does-not-exist',
      inspectableElementId: 'element-1',
      observations: 'Not accessible this cycle',
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(repository.upsertEntry(entry)).rejects.toBeInstanceOf(
      ReviewSessionNotFoundError,
    );
  });
});

// review-history design.md Decision 3, tasks.md 2.3/2.4: the representative's
// findCompleted…InCommunities pair, including the fail-closed empty-scope
// case, mirroring the Prisma adapter's own integration coverage.
//
// review-history-company-scope/tasks.md 3.6: the technician's
// community-narrowed pair (`findCompletedForPerformerInCommunities`/
// `findCompletedByIdForPerformerInCommunities`) was deleted from the port
// (design.md Decision 6/7) — coverage for the technician's replacement pair
// lives in the `findCompletedForPerformer/findCompletedForCompany` describe
// block below.
describe('InMemoryReviewSessionRepository — findCompleted…InCommunities', () => {
  function completedSession(
    overrides: Partial<{
      id: string;
      communityId: string;
      performedById: string;
      completedAt: Date;
    }> = {},
  ): ReviewSession {
    return new ReviewSession({
      id: overrides.id ?? 'session-1',
      communityId: overrides.communityId ?? 'community-1',
      templateId: 'template-1',
      performedById: overrides.performedById ?? 'user-1',
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt:
        overrides.completedAt ?? new Date('2026-01-02T00:00:00.000Z'),
    });
  }

  it('communityIds = [] resolves to an empty list / null (fail-closed empty scope)', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(completedSession());

    await expect(repository.findCompletedInCommunities([])).resolves.toEqual(
      [],
    );
    await expect(
      repository.findCompletedByIdInCommunities('session-1', []),
    ).resolves.toBeNull();
  });

  it('findCompletedInCommunities includes every performer in scope but excludes other communities and drafts', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const inScope = completedSession({ id: 'session-in-scope' });
    const otherCommunity = completedSession({
      id: 'session-other-community',
      communityId: 'community-2',
    });
    repository.seed(inScope);
    repository.seed(otherCommunity);

    const result = await repository.findCompletedInCommunities(['community-1']);

    expect(result.map((s) => s.id)).toEqual(['session-in-scope']);
  });

  it('orders completedAt DESC, id DESC — deterministic direction', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const earlier = completedSession({
      id: 'session-a',
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const later = completedSession({
      id: 'session-b',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    repository.seed(earlier);
    repository.seed(later);

    const communityHistory = await repository.findCompletedInCommunities([
      'community-1',
    ]);

    expect(communityHistory.map((s) => s.id)).toEqual([
      'session-b',
      'session-a',
    ]);
  });

  it('findCompletedByIdInCommunities rejects an out-of-scope community', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(completedSession());

    await expect(
      repository.findCompletedByIdInCommunities('session-1', ['community-2']),
    ).resolves.toBeNull();

    const draft = new ReviewSession({
      id: 'session-draft',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
    repository.seed(draft);
    await expect(
      repository.findCompletedByIdInCommunities('session-draft', [
        'community-1',
      ]),
    ).resolves.toBeNull();
  });
});

// review-history-company-scope/design.md Decision 6/7 (performer pair) and
// Decision 3/4/6/9 (company pair), tasks.md 2.8: same fixtures as the
// findCompleted…InCommunities describe block above, mirroring the Prisma
// adapter's own coverage of the four NEW methods.
describe('InMemoryReviewSessionRepository — findCompletedForPerformer/findCompletedForCompany (new methods)', () => {
  function completedSession(
    overrides: Partial<{
      id: string;
      communityId: string;
      performedById: string;
      performedByCompanyId: string | null;
      completedAt: Date;
    }> = {},
  ): ReviewSession {
    return new ReviewSession({
      id: overrides.id ?? 'session-1',
      communityId: overrides.communityId ?? 'community-1',
      templateId: 'template-1',
      performedById: overrides.performedById ?? 'user-1',
      performedByCompanyId:
        overrides.performedByCompanyId === undefined
          ? 'company-1'
          : overrides.performedByCompanyId,
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt:
        overrides.completedAt ?? new Date('2026-01-02T00:00:00.000Z'),
    });
  }

  it("findCompletedForPerformer returns only that performer's completed sessions, with no community narrowing at all", async () => {
    const repository = new InMemoryReviewSessionRepository();
    const own = completedSession({
      id: 'session-own',
      performedById: 'user-1',
    });
    const other = completedSession({
      id: 'session-other',
      performedById: 'user-2',
    });
    const draft = new ReviewSession({
      id: 'session-draft',
      communityId: 'community-2',
      templateId: 'template-1',
      performedById: 'user-1',
      status: 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
    repository.seed(own);
    repository.seed(other);
    repository.seed(draft);

    // A session in a DIFFERENT community from the same performer still
    // surfaces — no community conjunct on this method at all (the
    // reversal's point).
    const differentCommunity = completedSession({
      id: 'session-different-community',
      performedById: 'user-1',
      communityId: 'community-2',
    });
    repository.seed(differentCommunity);

    const result = await repository.findCompletedForPerformer('user-1');

    expect(result.map((s) => s.id).sort()).toEqual(
      ['session-own', 'session-different-community'].sort(),
    );
  });

  it('findCompletedByIdForPerformer rejects a foreign performer and a draft', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(completedSession());

    await expect(
      repository.findCompletedByIdForPerformer('session-1', 'user-2'),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedByIdForPerformer('session-1', 'user-1'),
    ).resolves.not.toBeNull();
  });

  it("findCompletedForCompany never returns another company's or a null-company session", async () => {
    const repository = new InMemoryReviewSessionRepository();
    const ownCompany = completedSession({
      id: 'session-company-a',
      performedByCompanyId: 'company-a',
    });
    const otherCompany = completedSession({
      id: 'session-company-b',
      performedByCompanyId: 'company-b',
    });
    const noCompany = completedSession({
      id: 'session-no-company',
      performedByCompanyId: null,
    });
    repository.seed(ownCompany);
    repository.seed(otherCompany);
    repository.seed(noCompany);

    const result = await repository.findCompletedForCompany('company-a');

    expect(result.map((s) => s.id)).toEqual(['session-company-a']);
  });

  it('findCompletedByIdForCompany rejects another company and a null-company session', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(
      completedSession({ id: 'session-1', performedByCompanyId: 'company-a' }),
    );
    repository.seed(
      completedSession({
        id: 'session-null',
        performedByCompanyId: null,
      }),
    );

    await expect(
      repository.findCompletedByIdForCompany('session-1', 'company-b'),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedByIdForCompany('session-null', 'company-a'),
    ).resolves.toBeNull();
    await expect(
      repository.findCompletedByIdForCompany('session-1', 'company-a'),
    ).resolves.not.toBeNull();
  });

  it('both new list methods order completedAt DESC, id DESC — identical direction to the shipped list methods', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const earlier = completedSession({
      id: 'session-a',
      performedByCompanyId: 'company-1',
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const later = completedSession({
      id: 'session-b',
      performedByCompanyId: 'company-1',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    repository.seed(earlier);
    repository.seed(later);

    const forPerformer = await repository.findCompletedForPerformer('user-1');
    const forCompany = await repository.findCompletedForCompany('company-1');

    expect(forPerformer.map((s) => s.id)).toEqual(['session-b', 'session-a']);
    expect(forCompany.map((s) => s.id)).toEqual(['session-b', 'session-a']);
  });
});

// review-history-admin-scope design.md Decision 1/2, tasks.md 1.8: the
// SYSTEM_ADMIN's unscoped pair — returns every completed session regardless
// of community/company/performer, a draft never surfaces, and ordering is
// identical to the other list methods.
describe('InMemoryReviewSessionRepository — findCompletedAcrossInstallation/findCompletedByIdAcrossInstallation (new methods)', () => {
  function completedSession(
    overrides: Partial<{
      id: string;
      communityId: string;
      performedById: string;
      performedByCompanyId: string | null;
      completedAt: Date;
    }> = {},
  ): ReviewSession {
    return new ReviewSession({
      id: overrides.id ?? 'session-1',
      communityId: overrides.communityId ?? 'community-1',
      templateId: 'template-1',
      performedById: overrides.performedById ?? 'user-1',
      performedByCompanyId:
        overrides.performedByCompanyId === undefined
          ? 'company-1'
          : overrides.performedByCompanyId,
      status: 'completed',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt:
        overrides.completedAt ?? new Date('2026-01-02T00:00:00.000Z'),
    });
  }

  it('returns every completed session regardless of community, company or performer', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(
      completedSession({
        id: 'session-a',
        communityId: 'community-1',
        performedById: 'user-1',
        performedByCompanyId: 'company-1',
      }),
    );
    repository.seed(
      completedSession({
        id: 'session-b',
        communityId: 'community-2',
        performedById: 'user-2',
        performedByCompanyId: 'company-2',
      }),
    );
    repository.seed(
      completedSession({
        id: 'session-c',
        communityId: 'community-3',
        performedById: 'user-3',
        performedByCompanyId: null,
      }),
    );

    const result = await repository.findCompletedAcrossInstallation();

    expect(result.map((s) => s.id).sort()).toEqual([
      'session-a',
      'session-b',
      'session-c',
    ]);
  });

  it('a draft never surfaces in the list or the by-id read', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const draft = new ReviewSession({
      id: 'session-draft',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
    });
    repository.seed(draft);

    await expect(repository.findCompletedAcrossInstallation()).resolves.toEqual(
      [],
    );
    await expect(
      repository.findCompletedByIdAcrossInstallation('session-draft'),
    ).resolves.toBeNull();
  });

  it('orders completedAt DESC, id DESC — identical direction to the other list methods', async () => {
    const repository = new InMemoryReviewSessionRepository();
    const earlier = completedSession({
      id: 'session-a',
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const later = completedSession({
      id: 'session-b',
      completedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    repository.seed(earlier);
    repository.seed(later);

    const result = await repository.findCompletedAcrossInstallation();

    expect(result.map((s) => s.id)).toEqual(['session-b', 'session-a']);
  });

  it('the by-id read returns any completed session unconditionally, and null for an unknown id', async () => {
    const repository = new InMemoryReviewSessionRepository();
    repository.seed(
      completedSession({
        id: 'session-a',
        communityId: 'community-9',
        performedById: 'user-9',
        performedByCompanyId: null,
      }),
    );

    await expect(
      repository.findCompletedByIdAcrossInstallation('session-a'),
    ).resolves.not.toBeNull();
    await expect(
      repository.findCompletedByIdAcrossInstallation('nonexistent'),
    ).resolves.toBeNull();
  });
});

// review-history-per-element design.md Decision 1/2, tasks.md coverage gap
// (fresh-context review, PR1): the entry-first `findCompletedEntriesForElement*`
// quartet — same fixture/style precedent as the describe blocks above, plus
// the prisma-review-session.repository.integration.spec.ts scenarios
// (element-history-*) this fake mirrors: draft exclusion, sibling-element
// exclusion, and the InCommunities fail-closed empty-scope case.
describe('InMemoryReviewSessionRepository — findCompletedEntriesForElement* (new methods)', () => {
  const elementId = 'element-1';
  const siblingElementId = 'element-2';

  function completedSessionWithEntry(
    overrides: Partial<{
      id: string;
      communityId: string;
      performedById: string;
      performedByCompanyId: string | null;
      status: 'draft' | 'completed';
      completedAt: Date;
      inspectableElementId: string;
      entryId: string;
    }> = {},
  ): ReviewSession {
    const status = overrides.status ?? 'completed';
    const entry = ElementReviewEntry.reviewed({
      id: overrides.entryId ?? `${overrides.id ?? 'session-1'}-entry`,
      reviewSessionId: overrides.id ?? 'session-1',
      inspectableElementId: overrides.inspectableElementId ?? elementId,
      answers: [
        new QuestionAnswer({
          id: 'answer-1',
          elementReviewEntryId: 'placeholder',
          questionId: 'question-1',
          answer: 'YES',
        }),
      ],
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    return new ReviewSession({
      id: overrides.id ?? 'session-1',
      communityId: overrides.communityId ?? 'community-1',
      templateId: 'template-1',
      performedById: overrides.performedById ?? 'user-1',
      performedByCompanyId:
        overrides.performedByCompanyId === undefined
          ? 'company-1'
          : overrides.performedByCompanyId,
      status,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt:
        status === 'completed'
          ? (overrides.completedAt ?? new Date('2026-01-02T00:00:00.000Z'))
          : null,
      entries: [entry],
    });
  }

  describe('findCompletedEntriesForElementForPerformer', () => {
    it("returns exactly the caller's own completed entries for this element", async () => {
      const repository = new InMemoryReviewSessionRepository();
      const own = completedSessionWithEntry({
        id: 'session-own',
        performedById: 'user-1',
      });
      const other = completedSessionWithEntry({
        id: 'session-other',
        performedById: 'user-2',
      });
      repository.seed(own);
      repository.seed(other);

      const rows = await repository.findCompletedEntriesForElementForPerformer(
        elementId,
        'user-1',
      );

      expect(rows.map((r) => r.entryId)).toEqual(['session-own-entry']);
    });

    it('excludes a draft session by the same performer on the same element', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const draft = completedSessionWithEntry({
        id: 'session-draft',
        performedById: 'user-1',
        status: 'draft',
      });
      repository.seed(draft);

      await expect(
        repository.findCompletedEntriesForElementForPerformer(
          elementId,
          'user-1',
        ),
      ).resolves.toEqual([]);
    });

    it('excludes the same performer entry for a sibling element', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const sibling = completedSessionWithEntry({
        id: 'session-sibling',
        performedById: 'user-1',
        inspectableElementId: siblingElementId,
      });
      repository.seed(sibling);

      await expect(
        repository.findCompletedEntriesForElementForPerformer(
          elementId,
          'user-1',
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('findCompletedEntriesForElementInCommunities', () => {
    it('communityIds = [] resolves to an empty list (fail-closed empty scope)', async () => {
      const repository = new InMemoryReviewSessionRepository();
      repository.seed(completedSessionWithEntry());

      await expect(
        repository.findCompletedEntriesForElementInCommunities(elementId, []),
      ).resolves.toEqual([]);
    });

    it('returns entries from every performer in an in-scope community — excludes an out-of-scope community', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const inScope = completedSessionWithEntry({
        id: 'session-in-scope',
        communityId: 'community-1',
        performedById: 'user-1',
      });
      const otherPerformerInScope = completedSessionWithEntry({
        id: 'session-in-scope-other-performer',
        communityId: 'community-1',
        performedById: 'user-2',
      });
      const outOfScope = completedSessionWithEntry({
        id: 'session-out-of-scope',
        communityId: 'community-2',
        performedById: 'user-1',
      });
      repository.seed(inScope);
      repository.seed(otherPerformerInScope);
      repository.seed(outOfScope);

      const rows = await repository.findCompletedEntriesForElementInCommunities(
        elementId,
        ['community-1'],
      );

      expect(rows.map((r) => r.entryId).sort()).toEqual(
        [
          'session-in-scope-entry',
          'session-in-scope-other-performer-entry',
        ].sort(),
      );
    });

    it('excludes a draft session and a sibling element in an in-scope community', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const draft = completedSessionWithEntry({
        id: 'session-draft',
        communityId: 'community-1',
        status: 'draft',
      });
      const sibling = completedSessionWithEntry({
        id: 'session-sibling',
        communityId: 'community-1',
        inspectableElementId: siblingElementId,
      });
      repository.seed(draft);
      repository.seed(sibling);

      await expect(
        repository.findCompletedEntriesForElementInCommunities(elementId, [
          'community-1',
        ]),
      ).resolves.toEqual([]);
    });
  });

  describe('findCompletedEntriesForElementForCompany', () => {
    it("returns only the caller's own company's entries", async () => {
      const repository = new InMemoryReviewSessionRepository();
      const ownCompany = completedSessionWithEntry({
        id: 'session-company-a',
        performedByCompanyId: 'company-a',
      });
      const otherCompany = completedSessionWithEntry({
        id: 'session-company-b',
        performedByCompanyId: 'company-b',
      });
      const noCompany = completedSessionWithEntry({
        id: 'session-no-company',
        performedByCompanyId: null,
      });
      repository.seed(ownCompany);
      repository.seed(otherCompany);
      repository.seed(noCompany);

      const rows = await repository.findCompletedEntriesForElementForCompany(
        elementId,
        'company-a',
      );

      expect(rows.map((r) => r.entryId)).toEqual(['session-company-a-entry']);
    });

    it('excludes a draft session and a sibling element for the same company', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const draft = completedSessionWithEntry({
        id: 'session-draft',
        performedByCompanyId: 'company-a',
        status: 'draft',
      });
      const sibling = completedSessionWithEntry({
        id: 'session-sibling',
        performedByCompanyId: 'company-a',
        inspectableElementId: siblingElementId,
      });
      repository.seed(draft);
      repository.seed(sibling);

      await expect(
        repository.findCompletedEntriesForElementForCompany(
          elementId,
          'company-a',
        ),
      ).resolves.toEqual([]);
    });
  });

  describe('findCompletedEntriesForElementAcrossInstallation', () => {
    it('returns entries across every performer and company', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const sessionA = completedSessionWithEntry({
        id: 'session-a',
        performedById: 'user-1',
        performedByCompanyId: 'company-1',
      });
      const sessionB = completedSessionWithEntry({
        id: 'session-b',
        performedById: 'user-2',
        performedByCompanyId: 'company-2',
      });
      const sessionC = completedSessionWithEntry({
        id: 'session-c',
        performedById: 'user-3',
        performedByCompanyId: null,
      });
      repository.seed(sessionA);
      repository.seed(sessionB);
      repository.seed(sessionC);

      const rows =
        await repository.findCompletedEntriesForElementAcrossInstallation(
          elementId,
        );

      expect(rows.map((r) => r.entryId).sort()).toEqual(
        ['session-a-entry', 'session-b-entry', 'session-c-entry'].sort(),
      );
    });

    it('excludes a draft session and a sibling element', async () => {
      const repository = new InMemoryReviewSessionRepository();
      const draft = completedSessionWithEntry({
        id: 'session-draft',
        status: 'draft',
      });
      const sibling = completedSessionWithEntry({
        id: 'session-sibling',
        inspectableElementId: siblingElementId,
      });
      repository.seed(draft);
      repository.seed(sibling);

      await expect(
        repository.findCompletedEntriesForElementAcrossInstallation(elementId),
      ).resolves.toEqual([]);
    });
  });
});
