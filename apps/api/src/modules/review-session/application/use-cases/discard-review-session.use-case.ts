import { Inject, Injectable } from '@nestjs/common';
import { ReviewSessionNotEditableError } from '../../domain/errors/review-session-not-editable.error';
import { Actor, SessionAccessService } from '../services/session-access.service';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

// spec.md "Discard a Draft Session": hard delete of the ReviewSession row
// (design.md Interfaces/Contracts — no deletedAt exists on this table),
// WHERE status='draft'; false => 409 REVIEW_SESSION_NOT_EDITABLE. Reached
// exclusively through SessionAccess (Decision 4, Layer 3) — only the
// opener, in scope, may discard. The domain-layer `session.discard()` guard
// runs first (Decision 8) as the primary immutability enforcement; the
// repository's own `WHERE status='draft'` is the concurrency backstop for
// a lost race.
@Injectable()
export class DiscardReviewSessionUseCase {
  constructor(
    private readonly sessionAccess: SessionAccessService,
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly repository: ReviewSessionRepository,
  ) {}

  async execute(sessionId: string, actor: Actor): Promise<void> {
    const session = await this.sessionAccess.loadForActor(sessionId, actor);
    session.discard();

    const discarded = await this.repository.discardDraft(sessionId);
    if (!discarded) {
      throw new ReviewSessionNotEditableError();
    }
  }
}
