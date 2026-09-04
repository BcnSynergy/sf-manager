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
import { ElementCodeAlreadyExistsError } from '../../domain/errors/element-code-already-exists.error';
import { ElementCodeGenerationFailedError } from '../../domain/errors/element-code-generation-failed.error';
import { InspectableElement } from '../../domain/inspectable-element.entity';
import { formatInstalledAt, parseInstalledAt } from '../../domain/installed-at';
import {
  ELEMENT_CODE_GENERATOR,
  type ElementCodeGenerator,
} from '../ports/element-code-generator.port';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../ports/inspectable-element.repository.port';

// design.md Decision 3: 3 bounded attempts — generous at this collision
// probability (31^10 combinations); exhaustion signals a systemic bug, not
// an unlucky draw, so it fails loudly rather than retrying forever.
const MAX_CODE_GENERATION_ATTEMPTS = 3;

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
  code: string;
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
    @Inject(ELEMENT_CODE_GENERATOR)
    private readonly elementCodeGenerator: ElementCodeGenerator,
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

    const element = await this.createWithUniqueCode(input);

    return {
      id: element.id,
      communityId: element.communityId,
      elementType: element.elementType,
      name: element.name,
      description: element.description,
      location: element.location,
      serialNumber: element.serialNumber,
      installedAt: formatInstalledAt(element.installedAt),
      code: element.code,
    };
  }

  // design.md Decision 3: generate -> repository.create() -> on
  // ElementCodeAlreadyExistsError regenerate and retry, bounded at
  // MAX_CODE_GENERATION_ATTEMPTS; after the last attempt fails, throw
  // ElementCodeGenerationFailedError instead of retrying forever.
  private async createWithUniqueCode(
    input: CreateInspectableElementInput,
  ): Promise<InspectableElement> {
    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
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
        code: this.elementCodeGenerator.generate(),
      });

      try {
        await this.elementRepository.create(element);
        return element;
      } catch (error) {
        if (!(error instanceof ElementCodeAlreadyExistsError)) {
          throw error;
        }
      }
    }

    throw new ElementCodeGenerationFailedError();
  }
}
