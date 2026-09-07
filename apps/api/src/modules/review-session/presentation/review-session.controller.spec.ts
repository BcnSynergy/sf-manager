import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { DiscardReviewSessionUseCase } from '../application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from '../application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from '../application/use-cases/list-own-review-sessions.use-case';
import { OpenReviewSessionUseCase } from '../application/use-cases/open-review-session.use-case';
import { ReadReviewSessionUseCase } from '../application/use-cases/read-review-session.use-case';
import { ReviewSessionController } from './review-session.controller';

// Fresh-context review on PR4, finding #A: ReadReviewSessionResult's
// entries carry `answers` (read-review-session.use-case.ts), and
// ReviewSessionController#read returns the use-case result unchanged — so
// the real HTTP response already includes `answers`, but
// ReviewSessionEntryDto (review-session-detail-response.dto.ts) never
// declared it. TypeScript never caught this because the controller does
// not build a fresh object literal against the DTO type — it just returns
// the use-case result structurally. Two angles covered here: (1) the
// actual value the controller hands back still carries `answers`, and (2)
// the OpenAPI/Swagger contract generated from the DTO class now declares
// it too, so API consumers/codegen relying on the published schema are no
// longer misled.
describe('ReviewSessionController', () => {
  const getReviewScopeUseCase = { execute: jest.fn() };
  const openReviewSessionUseCase = { execute: jest.fn() };
  const listOwnReviewSessionsUseCase = { execute: jest.fn() };
  const readReviewSessionUseCase = { execute: jest.fn() };
  const discardReviewSessionUseCase = { execute: jest.fn() };

  let controller: ReviewSessionController;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [ReviewSessionController],
      providers: [
        { provide: GetReviewScopeUseCase, useValue: getReviewScopeUseCase },
        {
          provide: OpenReviewSessionUseCase,
          useValue: openReviewSessionUseCase,
        },
        {
          provide: ListOwnReviewSessionsUseCase,
          useValue: listOwnReviewSessionsUseCase,
        },
        {
          provide: ReadReviewSessionUseCase,
          useValue: readReviewSessionUseCase,
        },
        {
          provide: DiscardReviewSessionUseCase,
          useValue: discardReviewSessionUseCase,
        },
      ],
    }).compile();

    controller = moduleRef.get(ReviewSessionController);
  });

  describe('GET /review-sessions/:sessionId — answers field (review finding #A)', () => {
    const actor: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'user-1@example.com',
      role: 'MAINTENANCE_TECHNICIAN',
      jti: 'jti-1',
      exp: 9999999999,
    };

    const fixture = {
      id: 'session-1',
      communityId: 'community-1',
      templateId: 'template-1',
      performedById: 'user-1',
      status: 'draft',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      completedAt: null,
      entries: [
        {
          inspectableElementId: 'element-1',
          reviewed: true,
          observations: null,
          answers: [{ questionId: 'question-1', answer: 'YES' }],
          recordedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      coverage: { reviewed: 1, unreviewed: 0 },
    };

    it("the controller's real response carries each entry's answers, not just observations/reviewed", async () => {
      readReviewSessionUseCase.execute.mockResolvedValue(fixture);

      const result = await controller.read(actor, 'session-1');

      expect(result.entries[0]).toMatchObject({
        answers: [{ questionId: 'question-1', answer: 'YES' }],
      });
    });

    it('the OpenAPI schema generated for ReviewSessionEntryDto declares the answers property', async () => {
      const app: INestApplication = moduleRef.createNestApplication();
      await app.init();

      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const schemas = document.components?.schemas ?? {};
      const entrySchema = schemas['ReviewSessionEntryDto'] as
        { properties?: Record<string, unknown> } | undefined;

      expect(entrySchema?.properties).toHaveProperty('answers');

      await app.close();
    });
  });
});
