import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '../../../users/domain/role';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import { ReviewSession } from '../../domain/review-session.entity';
import { ReviewSessionNotFoundError } from '../../domain/errors/review-session-not-found.error';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

export interface Actor {
  userId: string;
  role: Role;
}

// design.md Decision 4, Layer 3: the ONLY code in this module that turns a
// sessionId into an aggregate. `ReviewSessionRepository` exposes no plain
// `findById(id)`, so a use case that forgets this service has nothing else
// to call. Two independent failure causes — unknown/foreign sessionId
// (Layer 3's own scoped read) and a since-deactivated assignment (Layer 2)
// — collapse to the SAME `ReviewSessionNotFoundError`, mirroring the
// rejection matrix (design.md "a sessionId is server-generated and never
// guessable, so existence is the secret and 404 is the safe answer").
@Injectable()
export class SessionAccessService {
  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly repository: ReviewSessionRepository,
    @Inject(COMMUNITY_SCOPE_CHECKER)
    private readonly communityScopeChecker: CommunityScopeChecker,
  ) {}

  async loadForActor(sessionId: string, actor: Actor): Promise<ReviewSession> {
    const session = await this.repository.findByIdForPerformer(
      sessionId,
      actor.userId,
    );
    if (!session) {
      throw new ReviewSessionNotFoundError();
    }

    const inScope = await this.communityScopeChecker.isAssignedTo(
      actor.userId,
      actor.role,
      session.communityId,
    );
    if (!inScope) {
      throw new ReviewSessionNotFoundError();
    }

    return session;
  }
}
