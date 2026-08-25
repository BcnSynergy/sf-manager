import { Inject, Injectable } from '@nestjs/common';
import { Locale } from '../../domain/community.entity';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../ports/community.repository.port';

export interface ListedCommunity {
  id: string;
  name: string;
  address: string;
  locale: Locale;
}

// design.md Testing Strategy + community-management spec.md "List
// Communities": findAll() already excludes soft-deleted rows by construction
// (ADR-010) — this use case adds no filtering of its own.
@Injectable()
export class ListCommunitiesUseCase {
  constructor(
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
  ) {}

  async execute(): Promise<ListedCommunity[]> {
    const communities = await this.communityRepository.findAll();
    return communities.map((community) => ({
      id: community.id,
      name: community.name,
      address: community.address,
      locale: community.locale,
    }));
  }
}
