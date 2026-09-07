import { HttpException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { DiscardReviewSessionUseCase } from '../application/use-cases/discard-review-session.use-case';
import { GetReviewScopeUseCase } from '../application/use-cases/get-review-scope.use-case';
import { ListOwnReviewSessionsUseCase } from '../application/use-cases/list-own-review-sessions.use-case';
import { OpenReviewSessionUseCase } from '../application/use-cases/open-review-session.use-case';
import { ReadReviewSessionUseCase } from '../application/use-cases/read-review-session.use-case';
import { ResolveElementByCodeUseCase } from '../application/use-cases/resolve-element-by-code.use-case';
import { RecordEntryUseCase } from '../application/use-cases/record-entry.use-case';
import { InspectableElementNotFoundError } from '../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { AnswersDoNotMatchTemplateError } from '../domain/errors/answers-do-not-match-template.error';
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
  const resolveElementByCodeUseCase = { execute: jest.fn() };
  const recordEntryUseCase = { execute: jest.fn() };

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
        {
          provide: ResolveElementByCodeUseCase,
          useValue: resolveElementByCodeUseCase,
        },
        {
          provide: RecordEntryUseCase,
          useValue: recordEntryUseCase,
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

  // Phase 5 (tasks.md 5.6): the two by-code/entry-recording routes and
  // their error-code mappings.
  describe('GET /review-sessions/:sessionId/elements/:code', () => {
    const actor: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'user-1@example.com',
      role: 'MAINTENANCE_TECHNICIAN',
      jti: 'jti-1',
      exp: 9999999999,
    };

    it('returns the resolved element, questions and entry', async () => {
      const fixture = {
        element: {
          id: 'element-1',
          code: 'X1',
          name: 'Extinguisher #1',
          location: 'Lobby',
        },
        questions: [
          { questionId: 'question-1', order: 1, text: 'Is the seal intact?' },
        ],
        entry: null,
      };
      resolveElementByCodeUseCase.execute.mockResolvedValue(fixture);

      const result = await controller.resolveElement(actor, 'session-1', 'X1');

      expect(result).toEqual(fixture);
    });

    it('maps InspectableElementNotFoundError to 404 ELEMENT_NOT_FOUND', async () => {
      resolveElementByCodeUseCase.execute.mockRejectedValue(
        new InspectableElementNotFoundError(),
      );

      const response = await controller
        .resolveElement(actor, 'session-1', 'UNKNOWN')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toMatchObject({
        code: 'ELEMENT_NOT_FOUND',
      });
    });
  });

  describe('PUT /review-sessions/:sessionId/entries/:elementId', () => {
    const actor: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'user-1@example.com',
      role: 'MAINTENANCE_TECHNICIAN',
      jti: 'jti-1',
      exp: 9999999999,
    };

    it('records a reviewed entry from an answers body', async () => {
      const fixture = {
        inspectableElementId: 'element-1',
        reviewed: true,
        observations: null,
        answers: [{ questionId: 'question-1', answer: 'YES' }],
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      recordEntryUseCase.execute.mockResolvedValue(fixture);

      const result = await controller.recordEntry(
        actor,
        'session-1',
        'element-1',
        {
          answers: [{ questionId: 'question-1', value: 'YES' }],
        },
      );

      expect(result).toEqual(fixture);
      expect(recordEntryUseCase.execute).toHaveBeenCalledWith(
        'session-1',
        'element-1',
        {
          kind: 'reviewed',
          answers: [{ questionId: 'question-1', value: 'YES' }],
        },
        { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' },
      );
    });

    it('records an unreviewed entry from an observations body', async () => {
      const fixture = {
        inspectableElementId: 'element-1',
        reviewed: false,
        observations: 'sealed room, no access',
        answers: [],
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      recordEntryUseCase.execute.mockResolvedValue(fixture);

      const result = await controller.recordEntry(
        actor,
        'session-1',
        'element-1',
        {
          observations: 'sealed room, no access',
        },
      );

      expect(result).toEqual(fixture);
      expect(recordEntryUseCase.execute).toHaveBeenCalledWith(
        'session-1',
        'element-1',
        { kind: 'unreviewed', observations: 'sealed room, no access' },
        { userId: 'user-1', role: 'MAINTENANCE_TECHNICIAN' },
      );
    });

    it('maps AnswersDoNotMatchTemplateError to 400 ANSWERS_DO_NOT_MATCH_TEMPLATE', async () => {
      recordEntryUseCase.execute.mockRejectedValue(
        new AnswersDoNotMatchTemplateError(),
      );

      const response = await controller
        .recordEntry(actor, 'session-1', 'element-1', {
          answers: [{ questionId: 'question-1', value: 'YES' }],
        })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toMatchObject({
        code: 'ANSWERS_DO_NOT_MATCH_TEMPLATE',
      });
    });

    // Fresh-context review CRITICAL finding (PR5): an out-of-scope
    // elementId (foreign community, wrong type, unknown, decommissioned or
    // soft-deleted) must map to the SAME 404 the GET .../elements/:code
    // route uses — mapError is generic across the whole controller, this
    // confirms the PUT route actually reaches it.
    it('maps InspectableElementNotFoundError to 404 ELEMENT_NOT_FOUND', async () => {
      recordEntryUseCase.execute.mockRejectedValue(
        new InspectableElementNotFoundError(),
      );

      const response = await controller
        .recordEntry(actor, 'session-1', 'does-not-exist', {
          answers: [{ questionId: 'question-1', value: 'YES' }],
        })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toMatchObject({
        code: 'ELEMENT_NOT_FOUND',
      });
    });
  });
});
