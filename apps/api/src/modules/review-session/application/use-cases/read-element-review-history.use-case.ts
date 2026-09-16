import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import {
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports/user-directory.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';
import type { ElementReviewEntryRow } from '../ports/review-session.repository.port';

export interface ReadElementReviewHistoryHeader {
  id: string;
  code: string;
  name: string;
  elementType: string;
  location: string;
  communityId: string;
  communityName: string;
  deactivatedAt: Date | null;
}

export interface ReadElementReviewHistoryRow {
  reviewSessionId: string;
  performedById: string;
  performedByEmail: string;
  reviewed: boolean;
  observations: string | null;
  recordedAt: Date;
}

export interface ReadElementReviewHistoryResult {
  element: ReadElementReviewHistoryHeader;
  entries: ReadElementReviewHistoryRow[];
}

// review-history-per-element/design.md Decision 3: the shared adapter-owned
// ordering constant, applied ONCE here after the join — all four repository
// scopes are identical by construction rather than by four copies of an
// `orderBy`. Deterministic on equal `recordedAt` (`entryId` is a UUIDv7,
// ADR-009).
function elementHistoryOrder(
  a: ElementReviewEntryRow,
  b: ElementReviewEntryRow,
): number {
  const aRecordedAt = a.recordedAt.getTime();
  const bRecordedAt = b.recordedAt.getTime();
  if (aRecordedAt !== bRecordedAt) {
    return bRecordedAt - aRecordedAt;
  }
  return a.entryId < b.entryId ? 1 : a.entryId > b.entryId ? -1 : 0;
}

// review-history-per-element/design.md Decision 5: element FIRST, always —
// this is what makes the `:communityId` segment VERIFIED rather than
// decorative, and it means an out-of-community or soft-deleted element
// never reaches a scope checker at all. Every rejection cause (unknown id,
// wrong community, soft-deleted element, out-of-scope caller, ungranted
// MANAGER, a technician/company manager with no entries of their own)
// collapses into the SAME single throw site.
@Injectable()
export class ReadElementReviewHistoryUseCase {
  constructor(
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    private readonly accessService: ReviewHistoryAccessService,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(USER_DIRECTORY)
    private readonly userDirectory: UserDirectory,
  ) {}

  async execute(
    communityId: string,
    elementId: string,
    actor: Actor,
  ): Promise<ReadElementReviewHistoryResult> {
    const element = await this.elementRepository.findByIdInCommunity(
      communityId,
      elementId,
    );
    const scope = element
      ? await this.accessService.listElementHistoryForActor(element, actor)
      : null;

    // THE ONE THROW SITE. `!element` is TypeScript narrowing (Decision 5),
    // not a second cause — every one of unknown id, wrong community,
    // soft-deleted element, out-of-scope caller, ungranted MANAGER and a
    // technician/company manager with no entries of their own on this
    // element resolves to the SAME response, byte for byte.
    if (!element || !scope || !scope.reachable) {
      throw new InspectableElementNotFoundError();
    }

    // ONE CommunityRepository.findById call — the element's one community
    // (design.md Decision 5, a deliberate deviation from OQ4's working
    // assumption: two of the five roles reaching this page have no
    // community-name context anywhere on their own route).
    const community = await this.communityRepository.findById(
      element.communityId,
    );
    const communityName = community?.name ?? '';

    // ONE batched UserDirectory.findEmailsByIds call over the distinct
    // performedById values — the shipped company-scope Decision 8 pattern
    // verbatim.
    const performerIds = [
      ...new Set(scope.entries.map((entry) => entry.performedById)),
    ];
    const emailByPerformerId =
      await this.userDirectory.findEmailsByIds(performerIds);

    const sortedEntries = [...scope.entries].sort(elementHistoryOrder);

    return {
      element: {
        id: element.id,
        code: element.code,
        name: element.name,
        elementType: element.elementType,
        location: element.location,
        communityId: element.communityId,
        communityName,
        deactivatedAt: element.deactivatedAt,
      },
      entries: sortedEntries.map((entry) => ({
        reviewSessionId: entry.reviewSessionId,
        performedById: entry.performedById,
        performedByEmail: emailByPerformerId.get(entry.performedById) ?? '',
        // design.md Decision 5: derived in the application layer as
        // `observations === null` — the domain invariant
        // (ElementReviewEntry has no public constructor,
        // `.reviewed()`/`.unreviewed()` guarantee this exactly) makes this
        // exact without a second QuestionAnswer query.
        reviewed: entry.observations === null,
        observations: entry.observations,
        recordedAt: entry.recordedAt,
      })),
    };
  }
}
