import { Inject, Injectable } from '@nestjs/common';
import { Locale } from '../../domain/community.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';

export interface UpdateCommunityInput {
  id: string;
  name?: string;
  address?: string;
  locale?: Locale;
}

export interface UpdateCommunityResult {
  id: string;
  name: string;
  address: string;
  locale: Locale;
}

// design.md File Changes + community-management spec.md "Update Community" /
// "Update targets a non-existent community": same default deletedAt: null
// filter as findAll — a non-existent or soft-deleted id both 404 identically.
@Injectable()
export class UpdateCommunityUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(input: UpdateCommunityInput): Promise<UpdateCommunityResult> {
    const { id, ...changes } = input;

    const existing = await this.communityRepository.findById(id);
    if (!existing) {
      throw new CommunityNotFoundError();
    }

    await this.communityRepository.updateById(id, changes);

    return {
      id: existing.id,
      name: changes.name ?? existing.name,
      address: changes.address ?? existing.address,
      locale: changes.locale ?? existing.locale,
    };
  }
}
