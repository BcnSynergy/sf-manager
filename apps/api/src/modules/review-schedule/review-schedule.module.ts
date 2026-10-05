import { Module } from '@nestjs/common';
import { CommunityModule } from '../community/community.module';
import { UsersModule } from '../users/users.module';
import { REVIEW_SCHEDULE_READER } from './application/ports/review-schedule.reader.port';
import { ListReviewScheduleUseCase } from './application/use-cases/list-review-schedule.use-case';
import { PrismaReviewScheduleReader } from './infrastructure/persistence/prisma-review-schedule.reader';
import { ReviewScheduleController } from './presentation/review-schedule.controller';

// review-schedule design.md Decision 9 and File Changes: registers the
// read-only `GET /review-schedule` surface. CommunityModule supplies
// COMMUNITY_SCOPE_CHECKER and UsersModule MANAGER_CAPABILITY_CHECKER; CLOCK
// comes from the global ClockModule. Neither imported module imports this one
// back, so there is no cycle. REVIEW_SCHEDULE_READER stays module-local (not
// exported): nothing else reads the schedule.
@Module({
  imports: [CommunityModule, UsersModule],
  controllers: [ReviewScheduleController],
  providers: [
    { provide: REVIEW_SCHEDULE_READER, useClass: PrismaReviewScheduleReader },
    ListReviewScheduleUseCase,
  ],
})
export class ReviewScheduleModule {}
