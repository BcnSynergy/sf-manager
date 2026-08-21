// Port (application layer, ADR-002/013): every module that needs a fresh
// entity identifier depends on this interface, never on a concrete ID
// scheme directly. See design.md Decision 3 — the concrete adapter is
// UuidV7IdGenerator (shared/infrastructure/id/uuid-v7.id-generator.ts).
export interface IdGenerator {
  generate(): string;
}

export const ID_GENERATOR = Symbol('ID_GENERATOR');
