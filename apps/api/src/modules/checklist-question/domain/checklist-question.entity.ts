import type { ElementType } from '@sf-manager/validation';
import { ReviewFrequency } from './review-frequency';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `ChecklistQuestion` model (design.md Interfaces).
// `text` is a plain field, not a Value Object (design.md Decision 7): admin
// free text, rendered verbatim, never parsed/compared/`t()`-ed — validation
// (non-empty, trimmed) lives in the shared Zod schema (packages/validation,
// Phase 3). `elementType` is imported as a type from `@sf-manager/validation`
// rather than re-declared here (design.md Decision 1) — closed-catalog
// types cross module boundaries through the validation package, never
// module-to-module. Mirrors InspectableElement: this constructor performs
// no validation of its own.
export interface ChecklistQuestionProps {
  id: string;
  elementType: ElementType;
  frequencies: ReviewFrequency[];
  text: string;
  deletedAt: Date | null;
}

export class ChecklistQuestion {
  readonly id: string;
  readonly elementType: ElementType;
  readonly frequencies: ReviewFrequency[];
  readonly text: string;
  readonly deletedAt: Date | null;

  constructor(props: ChecklistQuestionProps) {
    this.id = props.id;
    this.elementType = props.elementType;
    this.frequencies = props.frequencies;
    this.text = props.text;
    this.deletedAt = props.deletedAt;
  }

  // ADR-010: mirrors InspectableElement.isDeleted / MaintenanceCompany
  // .isDeleted / Community.isDeleted / User.isDeleted — the repository's
  // default `deletedAt: null` filter (SoftDeletableRepository) is what
  // actually excludes these rows from lookups; this getter only exposes the
  // same fact on the entity for callers that already have one. Soft-
  // deleting a ChecklistQuestion is NEVER blocked by references (design.md
  // Decision 6, proposal) — frozen ReviewTemplateQuestion rows are audit
  // snapshots, not live references.
  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
