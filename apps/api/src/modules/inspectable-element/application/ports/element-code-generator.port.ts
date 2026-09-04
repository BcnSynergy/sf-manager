// Port (application layer, ADR-002/013): CreateInspectableElementUseCase
// (Phase 3) depends on this interface, never on a concrete code scheme
// directly. Mirrors shared/application/ports/id-generator.port.ts exactly.
// See design.md Decision 3 — the concrete adapter is
// RandomElementCodeGenerator (infrastructure/code/random-element-code
// .generator.ts).
export interface ElementCodeGenerator {
  generate(): string;
}

export const ELEMENT_CODE_GENERATOR = Symbol('ELEMENT_CODE_GENERATOR');
