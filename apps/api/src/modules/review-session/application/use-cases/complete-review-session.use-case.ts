import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../../../../shared/application/ports/file-storage.port';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  OWN_SIGNATURE_READER,
  type OwnSignatureReader,
} from '../../../reviewer-signature/application/ports/own-signature.reader.port';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { SignatureRequiredError } from '../../domain/errors/signature-required.error';
import { UnreviewedElementsWithoutReasonError } from '../../domain/errors/unreviewed-elements-without-reason.error';
import { computeUncoveredElements } from '../../domain/completion-coverage';
import { REVIEW_SIGNATURE_DIRECTORY } from '../../domain/review-session.entity';
import {
  Actor,
  SessionAccessService,
} from '../services/session-access.service';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

export interface CompleteReviewSessionResult {
  id: string;
  status: 'completed';
  completedAt: Date;
}

// spec.md "Complete a Session With Explained Gaps Only" + "Completed
// Sessions Are Immutable". design.md Decision 2: the required set is
// active elements of (community, elementType) MINUS elements that already
// have an entry — any entry, reviewed or unreviewed, counts as coverage
// (domain/completion-coverage.ts, Phase 3.9). Reached exclusively through
// SessionAccess (Decision 4, Layer 3); `session.complete()` (Decision 8) is
// the primary immutability enforcement, and `repository.complete()`'s own
// `WHERE status='draft'` is the concurrency backstop for a lost race.
//
// reviewer-signature T2 (review-session-management "Completion Is the Signing
// Act"): after those two checks, the performer's CURRENT signature is copied
// to a fresh session-owned key `review-signatures/<sessionId>-<id>.<ext>`
// (fresh per attempt, so a concurrent attempt that loses the race deletes
// only its own copy, never the one the winner recorded) and that key is
// recorded in the SAME write that completes the session, so replacing the
// signature later never alters a signed session. No signature (or a recorded
// file that is gone) rejects with SignatureRequiredError before anything is
// written; a lost race or a failed write deletes the copy again.
@Injectable()
export class CompleteReviewSessionUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly sessionRepository: ReviewSessionRepository,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(OWN_SIGNATURE_READER)
    private readonly signatureReader: OwnSignatureReader,
    @Inject(FILE_STORAGE)
    private readonly fileStorage: FileStorage,
    @Inject(ID_GENERATOR)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<CompleteReviewSessionResult> {
    // SessionAccess throws ReviewSessionNotFoundError for an unknown/
    // foreign/out-of-scope session BEFORE anything below runs.
    const session = await this.sessionAccess.loadForActor(sessionId, actor);

    // design.md Decision 8: the aggregate root's own guard is the primary
    // immutability enforcement — throws ReviewSessionNotEditableError when
    // `status !== 'draft'`, before the coverage check even runs (spec.md
    // "Reopening a completed session is rejected").
    session.complete();

    // design.md Decision 11: a session stores templateId only, never a
    // separate elementType column — the frozen snapshot is the only source
    // of it, mirroring RecordEntryUseCase/ResolveElementByCodeUseCase.
    const template = await this.templateRepository.findFrozenWithSnapshot(
      session.templateId,
    );
    if (!template) {
      throw new ActiveTemplateNotFoundError();
    }

    // design.md Decision 2: "active elements of (community, elementType)" —
    // deletedAt IS NULL AND deactivatedAt IS NULL, resolved by the
    // repository's own eligibility predicate (Decision 3), not re-derived
    // here.
    const activeElements =
      await this.elementRepository.findActiveByCommunityAndType(
        session.communityId,
        template.elementType,
      );

    const uncovered = computeUncoveredElements(activeElements, session.entries);
    if (uncovered.length > 0) {
      throw new UnreviewedElementsWithoutReasonError(
        uncovered.map((element) => element.code),
      );
    }

    const signature = await this.signatureReader.execute(actor.userId);
    if (!signature) {
      throw new SignatureRequiredError();
    }
    const signatureKey = `${REVIEW_SIGNATURE_DIRECTORY}/${session.id}-${this.idGenerator.generate()}.${signature.extension}`;
    await this.fileStorage.put(signatureKey, signature.content);

    const completedAt = new Date();
    let completed: boolean;
    try {
      completed = await this.sessionRepository.complete(
        session.id,
        completedAt,
        signatureKey,
      );
    } catch (error) {
      await this.deleteCopyQuietly(signatureKey);
      throw error;
    }
    if (!completed) {
      // Concurrency backstop (Decision 8): a lost race against another
      // mutation between the domain guard above and this write.
      await this.deleteCopyQuietly(signatureKey);
      throw new ReviewSessionNotEditableError();
    }

    return { id: session.id, status: 'completed', completedAt };
  }

  // The copy is unreferenced once the write failed or lost: a failed delete
  // must not replace the error the caller is about to get.
  private async deleteCopyQuietly(key: string): Promise<void> {
    try {
      await this.fileStorage.delete(key);
    } catch {
      // Nothing references the key; the copy is harmless.
    }
  }
}
