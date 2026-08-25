import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../../../shared/application/ports/id-generator.port';
import { Community, Locale } from '../../domain/community.entity';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';

export interface CreateCommunityInput {
  name: string;
  address: string;
  locale: Locale;
}

export interface CreateCommunityResult {
  id: string;
  name: string;
  address: string;
  locale: Locale;
}

// design.md File Changes + community-management spec.md "Create Community":
// IdGenerator.generate() -> CommunityRepository.create(). deletedAt always
// initializes to null (Community entity invariant).
@Injectable()
export class CreateCommunityUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(input: CreateCommunityInput): Promise<CreateCommunityResult> {
    const community = new Community({
      id: this.idGenerator.generate(),
      name: input.name,
      address: input.address,
      locale: input.locale,
      deletedAt: null,
    });

    await this.communityRepository.create(community);

    return {
      id: community.id,
      name: community.name,
      address: community.address,
      locale: community.locale,
    };
  }
}
