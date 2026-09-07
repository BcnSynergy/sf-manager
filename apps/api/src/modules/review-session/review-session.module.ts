import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { ReviewTemplateModule } from '../review-template/review-template.module';
import { REVIEW_SESSION_REPOSITORY } from './application/ports/review-session.repository.port';
import { PrismaReviewSessionRepository } from './infrastructure/persistence/prisma-review-session.repository';
import { SessionAccessService } from './application/services/session-access.service';
import { DiscardReviewSessionUseCase } from './application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from './application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from './application/use-cases/list-own-review-sessions.use-case';
import { OpenReviewSessionUseCase } from './application/use-cases/open-review-session.use-case';
import { ReadReviewSessionUseCase } from './application/use-cases/read-review-session.use-case';
import { ReviewSessionController } from './presentation/review-session.controller';

// design.md File Changes (PR 4): registers the first review-session
// application/HTTP surface — open/resume/discard/list, 5 endpoints.
// Imports CommunityModule for COMMUNITY_REPOSITORY/
// COMMUNITY_TECHNICIAN_REPOSITORY/COMMUNITY_REPRESENTATIVE_REPOSITORY/
// COMMUNITY_SCOPE_CHECKER (design.md Decision 4/5 — all four already
// exported by CommunityModule since PR 2), and ReviewTemplateModule for
// REVIEW_TEMPLATE_REPOSITORY (Decision 7). `review-session` imports both;
// neither imports `review-session` back — no cycle.
@Module({
  imports: [CommunityModule, ReviewTemplateModule],
  controllers: [ReviewSessionController],
  providers: [
    {
      provide: REVIEW_SESSION_REPOSITORY,
      useClass: PrismaReviewSessionRepository,
    },
    SessionAccessService,
    GetReviewScopeUseCase,
    OpenReviewSessionUseCase,
    ListOwnReviewSessionsUseCase,
    ReadReviewSessionUseCase,
    DiscardReviewSessionUseCase,
  ],
})
export class ReviewSessionModule {}
