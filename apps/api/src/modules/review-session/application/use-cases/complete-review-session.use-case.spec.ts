import { InMemoryFileStorage } from '../../../../shared/testing/in-memory-file-storage';
import { pngHeader } from '../../../organization-profile/domain/testing/logo-fixtures';
import { ReadOwnSignatureImageUseCase } from '../../../reviewer-signature/application/use-cases/read-own-signature-image.use-case';
import { InMemoryReviewerSignatureRepository } from '../../../reviewer-signature/application/use-cases/testing/in-memory-reviewer-signature.repository';
import { SignatureRequiredError } from '../../domain/errors/signature-required.error';
import { InMemoryChecklistQuestionRepository } from '../../../checklist-question/application/use-cases/testing/in-memory-checklist-question.repository';
import { InMemoryReviewTemplateRepository } from '../../../review-template/application/use-cases/testing/in-memory-review-template.repository';
import { ReviewTemplate } from '../../../review-template/domain/review-template.entity';
import { InMemoryInspectableElementRepository } from '../../../inspectable-element/application/use-cases/testing/in-memory-inspectable-element.repository';
import { InspectableElement } from '../../../inspectable-element/domain/inspectable-element.entity';
import { ReviewSession } from '../../domain/review-session.entity';
import { ElementReviewEntry } from '../../domain/element-review-entry.entity';
import { QuestionAnswer } from '../../domain/question-answer.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { UnreviewedElementsWithoutReasonError } from '../../domain/errors/unreviewed-elements-without-reason.error';
import { InMemoryReviewSessionRepository } from './testing/in-memory-review-session.repository';
import { FakeCommunityScopeChecker } from './testing/fake-community-scope.checker';
import { SessionAccessService } from '../services/session-access.service';
import { CompleteReviewSessionUseCase } from './complete-review-session.use-case';

function draftSession(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return new ReviewSession({
    id: 'session-1',
    communityId: 'community-1',
    templateId: 'template-1',
    performedById: 'user-1',
    status: 'draft',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: null,
    ...overrides,
  });
}

function frozenTemplate(): ReviewTemplate {
  return new ReviewTemplate({
    id: 'template-1',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly checks',
    version: 1,
    status: 'active',
    draftQuestionIds: [],
    createdAt: new Date(),
    deletedAt: null,
  });
}

function element(
  overrides: Partial<InspectableElement> = {},
): InspectableElement {
  return new InspectableElement({
    id: 'element-1',
    communityId: 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extinguisher #1',
    description: null,
    location: 'Lobby',
    installedAt: new Date('2026-01-15'),
    serialNumber: null,
    deletedAt: null,
    code: 'CODE0000A1',
    deactivatedAt: null,
    ...overrides,
  });
}

// spec.md "Complete a Session With Explained Gaps Only". design.md
// Decision 2: the required set is active elements of (community,
// elementType), minus elements that already have an entry (any entry —
// reviewed OR unreviewed both count). Reached exclusively through
// SessionAccess (Decision 4, Layer 3); the domain-layer guard
// (session.complete()) is the primary immutability enforcement, and the
// repository's own `WHERE status='draft'` is the concurrency backstop.
function sequenceIds(): { generate: () => string } {
  let next = 0;
  return { generate: () => `copy-${++next}` };
}

describe('CompleteReviewSessionUseCase', () => {
  let sessionRepository: InMemoryReviewSessionRepository;
  let elementRepository: InMemoryInspectableElementRepository;
  let templateRepository: InMemoryReviewTemplateRepository;
  let scopeChecker: FakeCommunityScopeChecker;
  let sessionAccess: SessionAccessService;
  let signatures: InMemoryReviewerSignatureRepository;
  let storage: InMemoryFileStorage;
  let useCase: CompleteReviewSessionUseCase;
  const PNG = pngHeader(40, 12);

  // The performer's own registered signature, as the upload use case leaves
  // it: a file under `signatures/` and the row that records its key.
  async function registerSignature(
    userId: string,
    key = `signatures/${userId}.png`,
    content: Buffer = PNG,
  ): Promise<void> {
    await storage.put(key, content);
    await signatures.save(userId, key);
  }

  beforeEach(async () => {
    signatures = new InMemoryReviewerSignatureRepository();
    storage = new InMemoryFileStorage();
    await registerSignature('user-1');
    sessionRepository = new InMemoryReviewSessionRepository();
    elementRepository = new InMemoryInspectableElementRepository();
    templateRepository = new InMemoryReviewTemplateRepository(
      new InMemoryChecklistQuestionRepository(),
    );
    scopeChecker = new FakeCommunityScopeChecker();
    sessionAccess = new SessionAccessService(sessionRepository, scopeChecker);
    useCase = new CompleteReviewSessionUseCase(
      sessionAccess,
      sessionRepository,
      templateRepository,
      elementRepository,
      new ReadOwnSignatureImageUseCase(signatures, storage),
      storage,
      sequenceIds(),
    );
  });

  const actor = { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' as const };

  // spec.md "A fully reviewed session completes".
  it('completes a session when every active element has a recorded entry', async () => {
    const session = draftSession();
    session.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element());

    const result = await useCase.execute('session-1', actor);

    expect(result.status).toBe('completed');
    const stored = await sessionRepository.findByIdForPerformer(
      'session-1',
      'user-1',
    );
    expect(stored?.status).toBe('completed');
  });

  // spec.md "A partial session with explained gaps completes": one element
  // reviewed, one marked unreviewed with a reason — both count as coverage.
  it('completes a partial session when every gap carries an entry (reviewed or unreviewed)', async () => {
    const session = draftSession();
    session.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    session.markUnreviewed(
      ElementReviewEntry.unreviewed({
        id: 'entry-2',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-2',
        observations: 'sealed room, no access',
        recordedAt: new Date(),
      }),
    );
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element());
    elementRepository.seed(element({ id: 'element-2', code: 'CODE0000A2' }));

    const result = await useCase.execute('session-1', actor);

    expect(result.status).toBe('completed');
  });

  // spec.md "An unexplained gap blocks completion".
  it('rejects completion with UnreviewedElementsWithoutReasonError listing the offending codes, leaving the session draft', async () => {
    sessionRepository.seed(draftSession());
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element());
    elementRepository.seed(element({ id: 'element-2', code: 'CODE0000A2' }));

    const error = await useCase
      .execute('session-1', actor)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnreviewedElementsWithoutReasonError);
    expect(
      (error as UnreviewedElementsWithoutReasonError).elementCodes.sort(),
    ).toEqual(['CODE0000A1', 'CODE0000A2']);

    const stored = await sessionRepository.findByIdForPerformer(
      'session-1',
      'user-1',
    );
    expect(stored?.status).toBe('draft');
  });

  // spec.md "Decommissioned and soft-deleted elements do not block
  // completion".
  it('does not require a decommissioned or soft-deleted element', async () => {
    const session = draftSession();
    session.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(element());
    elementRepository.seed(
      element({
        id: 'element-2',
        code: 'CODE0000A2',
        deactivatedAt: new Date(),
      }),
    );
    elementRepository.seed(
      element({
        id: 'element-3',
        code: 'CODE0000A3',
        deletedAt: new Date(),
      }),
    );

    const result = await useCase.execute('session-1', actor);

    expect(result.status).toBe('completed');
  });

  // spec.md "Reopening a completed session is rejected" (via the domain
  // guard) — design.md Decision 8: session.complete() throws before the
  // coverage check even runs.
  it('rejects completing an already-completed session with ReviewSessionNotEditableError', async () => {
    sessionRepository.seed(
      draftSession({ status: 'completed', completedAt: new Date() }),
    );
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());

    await expect(useCase.execute('session-1', actor)).rejects.toThrow(
      ReviewSessionNotEditableError,
    );
  });

  // Fresh-context review finding M2 (test-coverage gap, not a code fix):
  // `findActiveByCommunityAndType(session.communityId, template.elementType)`
  // already derives BOTH arguments only from the loaded session/template,
  // never from request input — this locks that behaviour in with an actual
  // second community present in the fake, so a regression that widened the
  // query (or dropped the communityId filter) would be caught here.
  // Direction 1: another community's own uncovered elements of the SAME
  // type must never block THIS session's completion.
  it('completes a session unaffected by another community having its own uncovered elements of the same type', async () => {
    const session = draftSession();
    session.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-1',
        reviewSessionId: 'session-1',
        inspectableElementId: 'element-1',
        answers: [
          new QuestionAnswer({
            id: 'answer-1',
            elementReviewEntryId: 'entry-1',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    sessionRepository.seed(session);
    scopeChecker.assign('user-1', 'community-1');
    templateRepository.seed(frozenTemplate());
    // community-1's only active EXTINGUISHER — covered.
    elementRepository.seed(element());
    // community-2's own EXTINGUISHER of the SAME type, with NO entry at
    // all — this must never leak into community-1's session.
    elementRepository.seed(
      element({
        id: 'element-community-2',
        communityId: 'community-2',
        code: 'CODE0000B1',
      }),
    );

    const result = await useCase.execute('session-1', actor);

    expect(result.status).toBe('completed');
  });

  // Direction 2 (the converse): THIS community's own uncovered elements
  // must never block a DIFFERENT community's session from completing.
  it('completes a different community session unaffected by this community having its own uncovered elements of the same type', async () => {
    // community-1 has an uncovered EXTINGUISHER — deliberately no entry
    // recorded against it, and no session for community-1 in this test.
    elementRepository.seed(element());

    const sessionCommunity2 = draftSession({
      id: 'session-2',
      communityId: 'community-2',
    });
    sessionCommunity2.recordEntry(
      ElementReviewEntry.reviewed({
        id: 'entry-2',
        reviewSessionId: 'session-2',
        inspectableElementId: 'element-community-2',
        answers: [
          new QuestionAnswer({
            id: 'answer-2',
            elementReviewEntryId: 'entry-2',
            questionId: 'question-1',
            answer: 'YES',
          }),
        ],
        recordedAt: new Date(),
      }),
    );
    sessionRepository.seed(sessionCommunity2);
    scopeChecker.assign('user-1', 'community-2');
    templateRepository.seed(frozenTemplate());
    elementRepository.seed(
      element({
        id: 'element-community-2',
        communityId: 'community-2',
        code: 'CODE0000B1',
      }),
    );

    const result = await useCase.execute('session-2', actor);

    expect(result.status).toBe('completed');
  });

  it('rejects an out-of-scope session with ReviewSessionNotFoundError', async () => {
    sessionRepository.seed(draftSession());
    // Deliberately no scopeChecker.assign() call.

    await expect(useCase.execute('session-1', actor)).rejects.toThrow(
      ReviewSessionNotFoundError,
    );
  });

  // review-session-management "Completion Is the Signing Act": the
  // performer's signature is a precondition, checked after the domain guard
  // and the coverage check.
  describe('signature (reviewer-signature T2)', () => {
    function coveredSession(performedById = 'user-1'): void {
      const session = draftSession({ performedById });
      session.recordEntry(
        ElementReviewEntry.reviewed({
          id: 'entry-1',
          reviewSessionId: 'session-1',
          inspectableElementId: 'element-1',
          answers: [
            new QuestionAnswer({
              id: 'answer-1',
              elementReviewEntryId: 'entry-1',
              questionId: 'question-1',
              answer: 'YES',
            }),
          ],
          recordedAt: new Date(),
        }),
      );
      sessionRepository.seed(session);
      scopeChecker.assign(performedById, 'community-1');
      templateRepository.seed(frozenTemplate());
      elementRepository.seed(element());
    }

    async function storedKeys(): Promise<string[]> {
      return (await storage.list('review-signatures')).map((f) => f.key);
    }

    it('copies the current signature to a fresh review-signatures/<sessionId>-<id>.<ext> and records the key', async () => {
      coveredSession();

      await useCase.execute('session-1', actor);

      expect(await storedKeys()).toEqual([
        'review-signatures/session-1-copy-1.png',
      ]);
      expect(
        await storage.get('review-signatures/session-1-copy-1.png'),
      ).toEqual(PNG);
      expect(sessionRepository.signatureStorageKeyOf('session-1')).toBe(
        'review-signatures/session-1-copy-1.png',
      );
    });

    it('keeps the copy unchanged when the user replaces their signature afterwards', async () => {
      coveredSession();
      await useCase.execute('session-1', actor);

      await registerSignature(
        'user-1',
        'signatures/new.png',
        pngHeader(99, 99),
      );

      expect(
        await storage.get('review-signatures/session-1-copy-1.png'),
      ).toEqual(PNG);
      expect(sessionRepository.signatureStorageKeyOf('session-1')).toBe(
        'review-signatures/session-1-copy-1.png',
      );
    });

    it('rejects a performer without a signature with SignatureRequiredError, leaving the session draft and storing nothing', async () => {
      coveredSession('user-2');
      const noSignature = { userId: 'user-2', role: actor.role };

      await expect(useCase.execute('session-1', noSignature)).rejects.toThrow(
        SignatureRequiredError,
      );

      const stored = await sessionRepository.findByIdForPerformer(
        'session-1',
        'user-2',
      );
      expect(stored?.status).toBe('draft');
      expect(sessionRepository.signatureStorageKeyOf('session-1')).toBeNull();
      expect(await storedKeys()).toEqual([]);
    });

    it('rejects when the recorded signature file is gone', async () => {
      coveredSession();
      await storage.delete('signatures/user-1.png');

      await expect(useCase.execute('session-1', actor)).rejects.toThrow(
        SignatureRequiredError,
      );

      const stored = await sessionRepository.findByIdForPerformer(
        'session-1',
        'user-1',
      );
      expect(stored?.status).toBe('draft');
      expect(await storedKeys()).toEqual([]);
    });

    it('serves the new file when a concurrent replacement removed the first key', async () => {
      coveredSession();
      const replacement = pngHeader(7, 7);
      await storage.put('signatures/new.png', replacement);
      const find = jest
        .spyOn(signatures, 'findByUserId')
        .mockResolvedValueOnce({
          userId: 'user-1',
          storageKey: 'signatures/gone.png',
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          userId: 'user-1',
          storageKey: 'signatures/new.png',
          updatedAt: new Date(),
        });

      await useCase.execute('session-1', actor);

      expect(find).toHaveBeenCalledTimes(2);
      expect(
        await storage.get('review-signatures/session-1-copy-1.png'),
      ).toEqual(replacement);
    });

    it('checks the coverage before the signature: an unexplained gap wins over a missing signature', async () => {
      sessionRepository.seed(draftSession());
      scopeChecker.assign('user-1', 'community-1');
      templateRepository.seed(frozenTemplate());
      elementRepository.seed(element());
      await storage.delete('signatures/user-1.png');

      await expect(useCase.execute('session-1', actor)).rejects.toThrow(
        UnreviewedElementsWithoutReasonError,
      );
    });

    it('deletes the copy when the write loses the race', async () => {
      coveredSession();
      jest.spyOn(sessionRepository, 'complete').mockResolvedValue(false);

      await expect(useCase.execute('session-1', actor)).rejects.toThrow(
        ReviewSessionNotEditableError,
      );

      expect(await storedKeys()).toEqual([]);
    });

    // Two attempts on one session (double click, two tabs): the loser deletes
    // only its own copy, never the file the winner recorded.
    it("never deletes the winning attempt's copy when this attempt loses the race", async () => {
      coveredSession();
      const complete = jest.spyOn(sessionRepository, 'complete');
      // The winner's write records its copy; the session is still loaded as
      // a draft by the second attempt, whose write then finds it completed.
      complete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      await useCase.execute('session-1', actor);

      await expect(useCase.execute('session-1', actor)).rejects.toThrow(
        ReviewSessionNotEditableError,
      );

      expect(await storedKeys()).toEqual([
        'review-signatures/session-1-copy-1.png',
      ]);
      expect(
        await storage.get('review-signatures/session-1-copy-1.png'),
      ).toEqual(PNG);
    });

    it('deletes the copy and rethrows when the write fails', async () => {
      coveredSession();
      const failure = new Error('db down');
      jest.spyOn(sessionRepository, 'complete').mockRejectedValue(failure);

      await expect(useCase.execute('session-1', actor)).rejects.toBe(failure);

      expect(await storedKeys()).toEqual([]);
    });

    it('keeps the already-completed rejection ahead of the signature check', async () => {
      sessionRepository.seed(
        draftSession({ status: 'completed', completedAt: new Date() }),
      );
      scopeChecker.assign('user-1', 'community-1');
      await storage.delete('signatures/user-1.png');

      await expect(useCase.execute('session-1', actor)).rejects.toThrow(
        ReviewSessionNotEditableError,
      );
    });
  });
});
