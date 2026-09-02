import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import { ElementType } from '../../domain/element-type';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import {
  formatInstalledAt,
  parseInstalledAt,
} from '../../domain/installed-at';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../ports/inspectable-element.repository.port';

export interface CreateInspectableElementInput {
  communityId: string;
  elementType: ElementType;
  name: string;
  description?: string;
  location: string;
  serialNumber?: string;
  installedAt: string;
}

export interface CreateInspectableElementResult {
  id: string;
  communityId: string;
  elementType: ElementType;
  name: string;
  description: string | null;
  location: string;
  serialNumber: string | null;
  installedAt: string;
}

// design.md Data Flow — POST /communities/:communityId/inspectable-elements
// + inspectable-element-management spec.md "Create Inspectable Element
// Under a Community": the parent-existence guard
// (communityRepository.findById) runs BEFORE any write (design.md Decision
// 5) — a rejected guard creates zero element rows. deletedAt always
// initializes to null. No uniqueness read-check: nothing about this entity
// is unique (design.md "No Uniqueness Constraints on Name, Location, or
// Serial Number").
@Injectable()
export class CreateInspectableElementUseCase {
  constructor(
    @Inject(INSPECTABLE_ELEMENT_REPOSITORY)
    private readonly elementRepository: InspectableElementRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    input: CreateInspectableElementInput,
  ): Promise<CreateInspectableElementResult> {
    const community = await this.communityRepository.findById(
      input.communityId,
    );
    if (!community) {
      throw new CommunityNotFoundError();
    }

    const element = new InspectableElement({
      id: this.idGenerator.generate(),
      communityId: input.communityId,
      elementType: input.elementType,
      name: input.name,
      description: input.description ?? null,
      location: input.location,
      installedAt: parseInstalledAt(input.installedAt),
      serialNumber: input.serialNumber ?? null,
      deletedAt: null,
    });

    await this.elementRepository.create(element);

    return {
      id: element.id,
      communityId: element.communityId,
      elementType: element.elementType,
      name: element.name,
      description: element.description,
      location: element.location,
      serialNumber: element.serialNumber,
      installedAt: formatInstalledAt(element.installedAt),
    };
  }
}
