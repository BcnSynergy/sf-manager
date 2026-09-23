import { Inject, Injectable } from '@nestjs/common';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import {
  ORGANIZATION_PROFILE_READER,
  type OrganizationProfileReader,
} from '../../../organization-profile/application/ports/organization-profile.reader.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
  type TemplateQuestionEntry,
} from '../../../review-template/application/ports/review-template.repository.port';
import type { ReviewSessionStatus } from '../../domain/review-session-status';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import {
  REVIEW_DOCUMENT_NAME_DIRECTORY,
  type ReviewDocumentNameDirectory,
} from '../ports/review-document-name-directory.port';
import {
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports/user-directory.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import {
  buildHistoryEntries,
  type ReadReviewHistoryEntry,
} from './review-history-entries';

// design.md Interfaces/Contracts. `ReviewDocumentEntry` only ADDS
// elementName/elementLocation to the history entry shape — it never
// widens or narrows the shared answers/observations contract
// (review-history-entries.ts), matching spec.md "The recorded record
// matches the history read-back ... in its entry set, answers,
// snapshotted wording and unreviewed reasons".
export interface ReviewDocumentEntry extends ReadReviewHistoryEntry {
  elementName: string | null; // null only when the id has no row
  elementLocation: string | null;
}

export interface ReadReviewDocumentResult {
  id: string;
  communityId: string;
  communityName: string;
  template: {
    name: string;
    elementType: ElementType;
    frequency: ReviewFrequency;
    version: number | null;
  };
  maintenanceCompanyName: string | null; // null = no company recorded
  performedById: string;
  performedByEmail: string;
  status: ReviewSessionStatus;
  startedAt: Date;
  completedAt: Date | null;
  entries: ReviewDocumentEntry[];
  questions: TemplateQuestionEntry[];
  letterhead: {
    name: string;
    legalName: string;
    taxId: string;
    address: string;
    phone: string;
    email: string;
  };
}

// design.md Decision 1: the scope gate FIRST, via the SAME
// ReviewHistoryAccessService.loadCompletedForActor the history read uses —
// its single throw site — so a rejected read (out of scope, nonexistent or
// draft) issues no template, name-directory, email or profile lookup at
// all (spec.md "A rejected read issues no name lookup"). design.md
// Decision 4 / spec.md "Inclusive Name Lookups Run Only Inside the Scope
// Gate": every lookup below is keyed only by identifiers carried by the
// LOADED session, never by a caller-supplied identifier other than the
// session id itself.
//
// PR 5 scope only: entries are enriched in the session's OWN order.
// `compareDocumentEntries` (deterministic code/recordedAt/id ordering) and
// `answerOrder` (per-question answer ordering) are PR 6 — this use case
// calls `buildHistoryEntries` exactly as the history read does, with no
// `answerOrder` argument, so answers stay in their recorded order here.
@Injectable()
export class ReadReviewDocumentUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
    @Inject(REVIEW_DOCUMENT_NAME_DIRECTORY)
    private readonly nameDirectory: ReviewDocumentNameDirectory,
    @Inject(USER_DIRECTORY)
    private readonly userDirectory: UserDirectory,
    @Inject(ORGANIZATION_PROFILE_READER)
    private readonly profileReader: OrganizationProfileReader,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<ReadReviewDocumentResult> {
    // Single throw site — nothing below runs for an out-of-scope,
    // nonexistent or draft session.
    const session = await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );

    const template = await this.templateRepository.findFrozenWithSnapshot(
      session.templateId,
    );
    if (!template) {
      throw new ActiveTemplateNotFoundError();
    }

    // One batched lookup for the whole entry set, keyed only by element
    // ids the session itself carries (design.md Data Flow step 3).
    const elementIds = [
      ...new Set(session.entries.map((entry) => entry.inspectableElementId)),
    ];
    const elementsById = await this.nameDirectory.findElementsByIds(elementIds);
    const codeByElementId = new Map(
      [...elementsById].map(([id, identity]) => [id, identity.code]),
    );

    // PR 5: no sort, no answerOrder — entries stay in the session's given
    // order (PR 6 adds compareDocumentEntries + answerOrder).
    const historyEntries = buildHistoryEntries(
      session.entries,
      codeByElementId,
    );
    const entries: ReviewDocumentEntry[] = historyEntries.map((entry) => {
      const identity = elementsById.get(entry.inspectableElementId);
      return {
        ...entry,
        elementName: identity?.name ?? null,
        elementLocation: identity?.location ?? null,
      };
    });

    const emailByPerformerId = await this.userDirectory.findEmailsByIds([
      session.performedById,
    ]);
    const performedByEmail =
      emailByPerformerId.get(session.performedById) ?? '';

    // Community is FK-protected (always has a row); the '' fallback below
    // is the same defensive contract as performedByEmail, never expected
    // to trigger in practice (design.md "Fallbacks and letterhead").
    const communityName =
      (await this.nameDirectory.findCommunityName(session.communityId)) ?? '';

    // spec.md "A session without an attributed company has no company":
    // `null` when nothing was recorded; the recorded-but-no-row case falls
    // back to '' (design.md "Fallbacks and letterhead"), never to `null`.
    const maintenanceCompanyName = session.performedByCompanyId
      ? ((await this.nameDirectory.findMaintenanceCompanyName(
          session.performedByCompanyId,
        )) ?? '')
      : null;

    const profile = await this.profileReader.get();

    return {
      id: session.id,
      communityId: session.communityId,
      communityName,
      template: {
        name: template.name,
        elementType: template.elementType,
        frequency: template.frequency,
        version: template.version,
      },
      maintenanceCompanyName,
      performedById: session.performedById,
      performedByEmail,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
      entries,
      questions: template.questions,
      // spec.md "The document exposes only the letterhead fields" — never
      // the profile's `id`/`logoAssetId`.
      letterhead: {
        name: profile.name,
        legalName: profile.legalName,
        taxId: profile.taxId,
        address: profile.address,
        phone: profile.phone,
        email: profile.email,
      },
    };
  }
}
