import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import { InspectableElementNotFoundError } from '../../domain/errors/inspectable-element-not-found.error';
import { ElementType } from '../../domain/element-type';
import {
  formatInstalledAt,
  parseInstalledAt,
} from '../../domain/installed-at';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../ports/inspectable-element.repository.port';

export interface UpdateInspectableElementInput {
  communityId: string;
  elementId: string;
  name?: string;
  description?: string | null;
  location?: string;
  serialNumber?: string | null;
  installedAt?: string;
}

export interface UpdateInspectableElementResult {
  id: string;
  communityId: string;
  elementType: ElementType;
  name: string;
  description: string | null;
  location: string;
  serialNumber: string | null;
  installedAt: string;
}

// design.md Decision 5 + inspectable-element-management spec.md "Update
// Inspectable Element": community check strictly precedes element check —
// an unknown community AND an unknown element deterministically returns
// COMMUNITY_NOT_FOUND, never a coin flip. `findByIdInCommunity` is the
// scoped read: wrong-community, unknown-id and soft-deleted all collapse to
// one indistinguishable 404. Neither communityId nor elementType is ever
// part of `changes` (design.md Interfaces) — an element does not move
// between communities and does not change type in this slice.
@Injectable()
export class UpdateInspectableElementUseCase {
  constructor(
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(
    input: UpdateInspectableElementInput,
  ): Promise<UpdateInspectableElementResult> {
    const { communityId, elementId, ...changes } = input;

    const community = await this.communityRepository.findById(communityId);
    if (!community) {
      throw new CommunityNotFoundError();
    }

    const existing = await this.elementRepository.findByIdInCommunity(
      communityId,
      elementId,
    );
    if (!existing) {
      throw new InspectableElementNotFoundError();
    }

    await this.elementRepository.updateById(elementId, {
      name: changes.name,
      description: changes.description,
      location: changes.location,
      serialNumber: changes.serialNumber,
      installedAt:
        changes.installedAt === undefined
          ? undefined
          : parseInstalledAt(changes.installedAt),
    });

    return {
      id: existing.id,
      communityId: existing.communityId,
      elementType: existing.elementType,
      name: changes.name ?? existing.name,
      description:
        changes.description === undefined
          ? existing.description
          : changes.description,
      location: changes.location ?? existing.location,
      serialNumber:
        changes.serialNumber === undefined
          ? existing.serialNumber
          : changes.serialNumber,
      installedAt:
        changes.installedAt ?? formatInstalledAt(existing.installedAt),
    };
  }
}
