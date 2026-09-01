import { ELEMENT_TYPES, ElementType } from './element-type';

// design.md Decision 1: ELEMENT_TYPES is the authoritative TypeScript union
// of inspectable element types — the Postgres enum (schema.prisma) and the
// Zod schema (packages/validation, Phase 5) are each a separate projection
// of this same set of values. Purely structural (const array + derived
// union type, no branching, no logic) — triangulation skipped per
// strict-tdd.md ("purely structural... literally ONE possible output").
describe('ELEMENT_TYPES', () => {
  it('declares EXTINGUISHER as the sole element type', () => {
    expect(ELEMENT_TYPES).toEqual(['EXTINGUISHER']);
  });

  it('is usable as the ElementType union at the type level', () => {
    const value: ElementType = 'EXTINGUISHER';

    expect(ELEMENT_TYPES).toContain(value);
  });
});
