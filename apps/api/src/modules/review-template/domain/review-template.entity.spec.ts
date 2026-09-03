import { ReviewTemplate, ReviewTemplateProps } from './review-template.entity';
import { ReviewTemplateNotEditableError } from './errors/review-template-not-editable.error';
import { ReviewTemplateStatus } from './review-template-status';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `ReviewTemplate` model (design.md Interfaces,
// PR 6). Status transitions (`draft -> active`, `active -> retired`,
// `retired` terminal, frozen => not editable) are domain behaviour and live
// here as pure guards (design.md Decision 7, mirroring
// `users/domain/last-admin.policy.ts`'s pure-function shape) — no VO, no
// constructor validation, mirroring ChecklistQuestion/Community exactly.
const makeTemplate = (
  overrides: Partial<ReviewTemplateProps> = {},
): ReviewTemplate =>
  new ReviewTemplate({
    id: '01930000-0000-7000-8000-000000000501',
    elementType: 'EXTINGUISHER',
    frequency: 'QUARTERLY',
    name: 'Quarterly extinguisher checklist',
    version: null,
    status: 'draft',
    draftQuestionIds: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  });

describe('ReviewTemplate', () => {
  it('constructs a draft template with the given identity and fields', () => {
    const template = makeTemplate({
      draftQuestionIds: ['question-1', 'question-2'],
    });

    expect(template.id).toBe('01930000-0000-7000-8000-000000000501');
    expect(template.elementType).toBe('EXTINGUISHER');
    expect(template.frequency).toBe('QUARTERLY');
    expect(template.name).toBe('Quarterly extinguisher checklist');
    expect(template.version).toBeNull();
    expect(template.status).toBe('draft');
    expect(template.draftQuestionIds).toEqual(['question-1', 'question-2']);
  });

  // spec.md "Activation Freezes...": draft -> active is the only legal
  // activation transition.
  describe('assertActivatable', () => {
    it('does not throw for a draft template', () => {
      const template = makeTemplate({ status: 'draft' });

      expect(() => template.assertActivatable()).not.toThrow();
    });

    // spec.md "Activating an already-active or retired template rejected"
    it.each<ReviewTemplateStatus>(['active', 'retired'])(
      'throws ReviewTemplateNotEditableError when status is %s (rejects re-activation)',
      (status) => {
        const template = makeTemplate({ status });

        expect(() => template.assertActivatable()).toThrow(
          ReviewTemplateNotEditableError,
        );
      },
    );
  });

  // spec.md "Frozen Templates Are Immutable": every mutation attempt on an
  // `active` or `retired` template MUST be rejected.
  describe('assertEditable', () => {
    it('does not throw for a draft template', () => {
      const template = makeTemplate({ status: 'draft' });

      expect(() => template.assertEditable()).not.toThrow();
    });

    it.each<ReviewTemplateStatus>(['active', 'retired'])(
      'throws ReviewTemplateNotEditableError when status is %s',
      (status) => {
        const template = makeTemplate({ status });

        expect(() => template.assertEditable()).toThrow(
          ReviewTemplateNotEditableError,
        );
      },
    );
  });
});
