import { Inject, Injectable } from '@nestjs/common';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import { ElementType } from '../../domain/element-type';
import { formatInstalledAt } from '../../domain/installed-at';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../ports/inspectable-element.repository.port';

export interface ListedInspectableElement {
  id: string;
  communityId: string;
  elementType: ElementType;
  name: string;
  description: string | null;
  location: string;
  serialNumber: string | null;
  installedAt: string;
  code: string;
}

// design.md "Where the settled policies live in code" + inspectable-
// element-management spec.md "List Elements By Community": the parent guard
// (communityRepository.findById) runs before the read; findAllByCommunity
// already excludes soft-deleted rows by construction (ADR-010) and is
// community-scoped by construction — this use case adds no filtering of its
// own.
@Injectable()
export class ListInspectableElementsByCommunityUseCase {
  constructor(
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(communityId: string): Promise<ListedInspectableElement[]> {
    const community = await this.communityRepository.findById(communityId);
    if (!community) {
      throw new CommunityNotFoundError();
    }

    const elements =
      await this.elementRepository.findAllByCommunity(communityId);

    return elements.map((element) => ({
      id: element.id,
      communityId: element.communityId,
      elementType: element.elementType,
      name: element.name,
      description: element.description,
      location: element.location,
      serialNumber: element.serialNumber,
      installedAt: formatInstalledAt(element.installedAt),
      code: element.code,
    }));
  }
}
