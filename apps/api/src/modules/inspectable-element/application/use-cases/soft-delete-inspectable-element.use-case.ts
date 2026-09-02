import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import { InspectableElementNotFoundError } from '../../domain/errors/inspectable-element-not-found.error';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../ports/inspectable-element.repository.port';

export interface SoftDeleteInspectableElementInput {
  communityId: string;
  elementId: string;
}

// design.md Decision 5 (ordering rule, explicitly repeated for this use
// case) + inspectable-element-management spec.md "Soft-Delete Inspectable
// Element": community check strictly precedes element check — an unknown
// community AND an unknown element deterministically returns
// COMMUNITY_NOT_FOUND, never a coin flip. `findByIdInCommunity` collapses
// wrong-community, unknown-id and already-soft-deleted into one
// indistinguishable 404, mirroring Update exactly.
@Injectable()
export class SoftDeleteInspectableElementUseCase {
  constructor(
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(input: SoftDeleteInspectableElementInput): Promise<void> {
    const community = await this.communityRepository.findById(
      input.communityId,
    );
    if (!community) {
      throw new CommunityNotFoundError();
    }

    const existing = await this.elementRepository.findByIdInCommunity(
      input.communityId,
      input.elementId,
    );
    if (!existing) {
      throw new InspectableElementNotFoundError();
    }

    await this.elementRepository.softDeleteById(input.elementId);
  }
}
