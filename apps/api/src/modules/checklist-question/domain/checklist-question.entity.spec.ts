import { ChecklistQuestion } from './checklist-question.entity';

// ADR-013: hand-written domain entity, zero Prisma/framework dependency.
// Fields mirror the Prisma `ChecklistQuestion` model (design.md Interfaces,
// PR 1). `text` stays a plain field — no Value Object (design.md
// Decision 7): rendered verbatim, never parsed/compared/`t()`-ed, and
// validation itself lives in the shared Zod schema (packages/validation,
// Phase 3) — mirroring InspectableElement exactly. This constructor
// performs no validation of its own.
describe('ChecklistQuestion', () => {
  it('constructs an active checklist question with the given identity and fields', () => {
    const question = new ChecklistQuestion({
      id: '01930000-0000-7000-8000-000000000401',
      elementType: 'EXTINGUISHER',
      frequencies: ['MONTHLY', 'QUARTERLY'],
      text: 'Is the pressure gauge in the green zone?',
      deletedAt: null,
    });

    expect(question.id).toBe('01930000-0000-7000-8000-000000000401');
    expect(question.elementType).toBe('EXTINGUISHER');
    expect(question.frequencies).toEqual(['MONTHLY', 'QUARTERLY']);
    expect(question.text).toBe('Is the pressure gauge in the green zone?');
    expect(question.isDeleted).toBe(false);
  });

  it('marks a checklist question with a deletedAt timestamp as deleted (ADR-010)', () => {
    const deletedAt = new Date('2026-04-01T00:00:00.000Z');

    const question = new ChecklistQuestion({
      id: '01930000-0000-7000-8000-000000000402',
      elementType: 'EXTINGUISHER',
      frequencies: ['ANNUAL'],
      text: 'Is the inspection tag legible and current?',
      deletedAt,
    });

    expect(question.deletedAt).toBe(deletedAt);
    expect(question.isDeleted).toBe(true);
  });
});
