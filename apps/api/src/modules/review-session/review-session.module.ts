import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { InspectableElementModule } from '../inspectable-element/inspectable-element.module';
import { OrganizationProfileModule } from '../organization-profile/organization-profile.module';
import { ReviewTemplateModule } from '../review-template/review-template.module';
import { UsersModule } from '../users/users.module';
import { REVIEW_SESSION_REPOSITORY } from './application/ports/review-session.repository.port';
import { USER_DIRECTORY } from './application/ports/user-directory.port';
import { REVIEW_DOCUMENT_NAME_DIRECTORY } from './application/ports/review-document-name-directory.port';
import { PrismaReviewSessionRepository } from './infrastructure/persistence/prisma-review-session.repository';
import { PrismaUserDirectory } from './infrastructure/persistence/prisma-user-directory';
import { PrismaReviewDocumentNameDirectory } from './infrastructure/persistence/prisma-review-document-name-directory';
import { SessionAccessService } from './application/services/session-access.service';
import { ReviewHistoryAccessService } from './application/services/review-history-access.service';
import { DiscardReviewSessionUseCase } from './application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from './application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from './application/use-cases/list-own-review-sessions.use-case';
import { ListReviewHistoryUseCase } from './application/use-cases/list-review-history.use-case';
import { OpenReviewSessionUseCase } from './application/use-cases/open-review-session.use-case';
import { ReadReviewHistoryUseCase } from './application/use-cases/read-review-history.use-case';
import { ReadElementReviewHistoryUseCase } from './application/use-cases/read-element-review-history.use-case';
import { ReadReviewDocumentUseCase } from './application/use-cases/read-review-document.use-case';
import { ReadReviewSessionUseCase } from './application/use-cases/read-review-session.use-case';
import { ResolveElementByCodeUseCase } from './application/use-cases/resolve-element-by-code.use-case';
import { RecordEntryUseCase } from './application/use-cases/record-entry.use-case';
import { CompleteReviewSessionUseCase } from './application/use-cases/complete-review-session.use-case';
import { ReviewSessionController } from './presentation/review-session.controller';
import { ReviewHistoryController } from './presentation/review-history.controller';

// design.md File Changes (PR 4/5): registers the review-session
// application/HTTP surface — open/resume/discard/list (PR 4) plus by-code
// resolution and entry recording (PR 5), 7 endpoints. review-history
// design.md File Changes (PR 1/2) adds the sibling read surface —
// ReviewHistoryController + ReviewHistoryAccessService +
// ListReviewHistoryUseCase (`GET /review-history`, PR 1) +
// ReadReviewHistoryUseCase (`GET /review-history/:sessionId`, PR 2) — on its
// OWN controller (Decision 4), leaving ReviewSessionController and
// SessionAccessService untouched. Imports CommunityModule for
// COMMUNITY_REPOSITORY/COMMUNITY_TECHNICIAN_REPOSITORY/
// COMMUNITY_REPRESENTATIVE_REPOSITORY/COMMUNITY_SCOPE_CHECKER (design.md
// Decision 4/5), ReviewTemplateModule for REVIEW_TEMPLATE_REPOSITORY
// (Decision 7), and InspectableElementModule for
// INSPECTABLE_ELEMENT_REPOSITORY (Decision 6, PR 5). `review-session`
// imports all three; none of them imports `review-session` back — no
// cycle.
//
// review-history-company-scope/design.md Decision 4: also imports
// `UsersModule` for `COMPANY_SCOPE_CHECKER` — verified acyclic in design's
// pre-work (`UsersModule` imports nothing from any module).
// review-export/design.md Decision 4: gains ONE import,
// `OrganizationProfileModule` (imports nothing itself, so no cycle) — for
// `ORGANIZATION_PROFILE_READER`, injected by `ReadReviewDocumentUseCase`.
// No new export: `REVIEW_DOCUMENT_NAME_DIRECTORY` stays module-local
// (spec.md "The lookup port is not exported").
@Module({
  imports: [
    CommunityModule,
    ReviewTemplateModule,
    InspectableElementModule,
    UsersModule,
    OrganizationProfileModule,
  ],
  controllers: [ReviewSessionController, ReviewHistoryController],
  providers: [
    {
      provide: REVIEW_SESSION_REPOSITORY,
      useClass: PrismaReviewSessionRepository,
    },
    // review-history-company-scope/design.md Decision 5: module-local,
    // non-authorizing cross-module read — bound here, not exported (no
    // other module needs it).
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    // review-export/design.md Decision 4: module-local, NOT exported
    // (spec.md "The lookup port is not exported") — bound in PR 4, wired
    // here in PR 7.
    {
      provide: REVIEW_DOCUMENT_NAME_DIRECTORY,
      useClass: PrismaReviewDocumentNameDirectory,
    },
    SessionAccessService,
    ReviewHistoryAccessService,
    GetReviewScopeUseCase,
    OpenReviewSessionUseCase,
    ListOwnReviewSessionsUseCase,
    ListReviewHistoryUseCase,
    ReadReviewHistoryUseCase,
    ReadElementReviewHistoryUseCase,
    ReadReviewDocumentUseCase,
    ReadReviewSessionUseCase,
    DiscardReviewSessionUseCase,
    ResolveElementByCodeUseCase,
    RecordEntryUseCase,
    CompleteReviewSessionUseCase,
  ],
})
export class ReviewSessionModule {}
