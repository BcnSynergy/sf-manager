import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { ReviewTemplateStatus } from './review-template-status';
import { ReviewTemplateNotEditableError } from './errors/review-template-not-editable.error';

// Hand-written domain entity (ADR-013) — zero Prisma/framework dependency.
// Fields mirror the Prisma `ReviewTemplate` model (design.md Interfaces,
// PR 6). Both `elementType` and `frequency` are imported as TYPES from
// `@sf-manager/validation`, never from `checklist-question`'s domain
// (design.md Decision 1: "closed-catalog types cross module boundaries
// through the validation package, never module-to-module... review-template
// does not import checklist-question's domain at all"). `frequency`'s
// domain-owning module is `checklist-question`
// (`domain/review-frequency.ts`, Phase 2), but its TYPE is re-exported
// through `@sf-manager/validation` (Phase 3, `reviewFrequencySchema`) —
// this file imports from there, not from the sibling module directly.
//
// No Value Objects (design.md Decision 7): `name`/`version`/`frequency`
// stay plain fields, validation lives in the shared Zod schema (Phase 8).
// Status transitions ARE domain behaviour (design.md Decision 7) and live
// here as pure guards, mirroring `users/domain/last-admin.policy.ts`'s
// pure-function shape: no I/O, no repository reference, just the invariant.
export interface ReviewTemplateProps {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
  version: number | null;
  status: ReviewTemplateStatus;
  draftQuestionIds: string[];
  createdAt: Date;
  deletedAt: Date | null;
}

export class ReviewTemplate {
  readonly id: string;
  readonly elementType: ElementType;
  readonly frequency: ReviewFrequency;
  readonly name: string;
  readonly version: number | null;
  readonly status: ReviewTemplateStatus;
  readonly draftQuestionIds: string[];
  readonly createdAt: Date;
  readonly deletedAt: Date | null;

  constructor(props: ReviewTemplateProps) {
    this.id = props.id;
    this.elementType = props.elementType;
    this.frequency = props.frequency;
    this.name = props.name;
    this.version = props.version;
    this.status = props.status;
    this.draftQuestionIds = props.draftQuestionIds;
    this.createdAt = props.createdAt;
    this.deletedAt = props.deletedAt;
  }

  // spec.md "Frozen Templates Are Immutable": the system MUST reject every
  // mutation attempt on an `active` or `retired` template — replacing or
  // reordering its question selection, renaming it, or soft-deleting it.
  // `draft` is the only editable status; this is a pure guard, no I/O.
  assertEditable(): void {
    if (this.status !== 'draft') {
      throw new ReviewTemplateNotEditableError();
    }
  }

  // spec.md "Activation Freezes the Template...": activating a template
  // that is not a `draft` MUST be rejected with 409 NOT_EDITABLE — this
  // covers BOTH an already-`active` template and a `retired` one, so
  // re-activation of a retired template is rejected the same way as any
  // other non-draft mutation ("retired is terminal... MUST NOT return to
  // active by any path"). Same invariant as assertEditable — draft is the
  // only status from which a legal transition exists — so this delegates
  // rather than duplicating the check.
  assertActivatable(): void {
    this.assertEditable();
  }
}
