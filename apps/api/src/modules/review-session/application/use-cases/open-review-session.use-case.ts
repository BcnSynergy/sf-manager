import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  COMMUNITY_SCOPE_CHECKER,
  type CommunityScopeChecker,
} from '../../../../shared/application/authorization/community-scope.checker.port';
import type { Role } from '../../../users/domain/role';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import { CommunityNotInScopeError } from '../../domain/errors/community-not-in-scope.error';
import { ReviewSession } from '../../domain/review-session.entity';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

export interface OpenReviewSessionInput {
  communityId: string;
  templateId: string;
  performedById: string;
  role: Role;
}

export interface OpenReviewSessionResult {
  id: string;
  communityId: string;
  templateId: string;
  performedById: string;
  status: 'draft';
  startedAt: Date;
}

// spec.md "Open a Review Session Against a Community and a Specific
// Template" + "At Most One Open Draft Per Community, Template and User".
//
// design.md Decision 4 (corrected 2026-09-07, BINDING on this use case):
// `AssignmentCommunityScopeChecker.isAssignedTo` returns `true` for an
// assignment active in a SOFT-DELETED community (neither assignment repo
// filters on the community's `deletedAt`). `isAssignedTo` itself is
// deliberately left unchanged (single-responsibility, no community-
// lifecycle awareness) — this use case closes the gap instead, by checking
// `communityRepository.findById(communityId)` FIRST. `findById` already
// excludes `deletedAt`-set rows (ADR-010), so `null` here means "does not
// exist OR is soft-deleted" — both collapse to the SAME
// CommunityNotInScopeError an unassigned actor gets, preserving the
// rejection matrix's indistinguishability end-to-end even though it now
// takes two checks instead of one.
@Injectable()
export class OpenReviewSessionUseCase {
  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly sessionRepository: ReviewSessionRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(COMMUNITY_SCOPE_CHECKER)
    private readonly communityScopeChecker: CommunityScopeChecker,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: OpenReviewSessionInput,
  ): Promise<OpenReviewSessionResult> {
    // Community-existence check FIRST (design.md Decision 4, corrected
    // 2026-09-07) — MUST run before isAssignedTo so a soft-deleted
    // community collapses to the same rejection as "not assigned".
    const community = await this.communityRepository.findById(
      input.communityId,
    );
    if (!community) {
      throw new CommunityNotInScopeError();
    }

    const inScope = await this.communityScopeChecker.isAssignedTo(
      input.performedById,
      input.role,
      input.communityId,
    );
    if (!inScope) {
      throw new CommunityNotInScopeError();
    }

    // spec.md "No active template for the element type" / "A draft
    // template can never back a session": unknown, draft and retired ids
    // are all rejected the same way — 404 ACTIVE_TEMPLATE_NOT_FOUND.
    const template = await this.templateRepository.findById(input.templateId);
    if (!template || template.status !== 'active') {
      throw new ActiveTemplateNotFoundError();
    }

    const session = new ReviewSession({
      id: this.idGenerator.generate(),
      communityId: input.communityId,
      templateId: input.templateId,
      performedById: input.performedById,
      status: 'draft',
      startedAt: new Date(),
      completedAt: null,
    });

    // P2002 on the partial unique open-draft index -> the adapter throws
    // OpenDraftAlreadyExistsError directly (task 4.10) — propagates
    // unchanged, mirroring the fake's own collision check.
    await this.sessionRepository.create(session);

    return {
      id: session.id,
      communityId: session.communityId,
      templateId: session.templateId,
      performedById: session.performedById,
      status: 'draft',
      startedAt: session.startedAt,
    };
  }
}
