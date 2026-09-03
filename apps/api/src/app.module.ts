import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/infrastructure/persistence/prisma.module';
import { IdGeneratorModule } from './shared/infrastructure/id/id-generator.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunityModule } from './modules/community/community.module';
import { MaintenanceCompanyModule } from './modules/maintenance-company/maintenance-company.module';
import { InspectableElementModule } from './modules/inspectable-element/inspectable-element.module';
import { ChecklistQuestionModule } from './modules/checklist-question/checklist-question.module';

// PR 4 (tasks.md Phase 7): first point every module built in PR 1-3 is
// actually wired into a running app. AuthModule self-registers the global
// APP_GUARD (auth.module.ts) — importing it here is what activates
// authentication for the whole app, so getAuthConfig() (JWT_SECRET/
// CORS_ORIGIN) now runs at boot. IdGeneratorModule is @Global(), imported
// once here so every module can inject ID_GENERATOR without re-importing it.
// CommunityModule (community PR 5) registers the admin-only /communities
// CRUD surface behind the same global AuthenticatedGuard/PermissionsGuard.
// MaintenanceCompanyModule (maintenance-company PR 8) registers the
// admin-only /maintenance-companies CRUD surface the same way.
// InspectableElementModule (inspectable-elements PR 6) registers the
// admin-only /communities/:communityId/inspectable-elements CRUD surface,
// importing CommunityModule for COMMUNITY_REPOSITORY (design.md Decision 4).
// ChecklistQuestionModule (checklist-management PR 4) registers the
// admin-only /checklist-questions CRUD surface — a global pool, no parent
// module import (design.md File Changes).
@Module({
  imports: [
    PrismaModule,
    IdGeneratorModule,
    UsersModule,
    AuthModule,
    CommunityModule,
    MaintenanceCompanyModule,
    InspectableElementModule,
    ChecklistQuestionModule,
    HealthModule,
  ],
})
export class AppModule {}
