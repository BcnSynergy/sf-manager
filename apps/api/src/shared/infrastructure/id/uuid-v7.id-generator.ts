import { v7 } from 'uuid';
import { IdGenerator } from '../../application/ports/id-generator.port';

// Adapter for IdGenerator (design.md Decision 3): `uuid` is the maintained
// ecosystem standard and already ships v7 — no second single-purpose
// dependency needed. Rejected: a DB-generated default (ADR-009).
export class UuidV7IdGenerator implements IdGenerator {
  generate(): string {
    return v7();
  }
}
