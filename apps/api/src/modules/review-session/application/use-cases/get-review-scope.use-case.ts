import { Inject, Injectable } from '@nestjs/common';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { ELEMENT_TYPES } from '../../../inspectable-element/domain/element-type';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../../../community/application/ports/community-technician.repository.port';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../../../community/application/ports/community-representative.repository.port';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../../community/application/ports/community.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../../review-template/application/ports/review-template.repository.port';

export interface ReviewScopeCommunity {
  id: string;
  name: string;
}

export interface ReviewScopeTemplate {
  id: string;
  elementType: ElementType;
  frequency: ReviewFrequency;
  name: string;
}

export interface ReviewScopeResult {
  communities: ReviewScopeCommunity[];
  templates: ReviewScopeTemplate[];
}

// design.md Decision 5/7 + Data Flow "GET /review-scope": calls
// findActiveByUser on BOTH assignment ports (a given user is normally only
// ever rows in one of them, but nothing about this use case assumes which)
// and merges the resulting community ids into a distinct set, resolving
// each name via the existing communityRepository.findById — accepted at
// this cardinality (design.md Decision 5: "a technician holds a handful of
// communities"). Templates are resolved across every declared ElementType
// (currently one: EXTINGUISHER) via findActiveByElementType, independent of
// the caller's assigned communities — the open-form re-validates the
// chosen (community, template) pair itself (OpenReviewSessionUseCase).
@Injectable()
export class GetReviewScopeUseCase {
  constructor(
    @Inject(COMMUNITY_TECHNICIAN_REPOSITORY)
    private readonly technicianRepository: CommunityTechnicianRepository,
    @Inject(COMMUNITY_REPRESENTATIVE_REPOSITORY)
    private readonly representativeRepository: CommunityRepresentativeRepository,
    @Inject(COMMUNITY_REPOSITORY)
    private readonly communityRepository: CommunityRepository,
    @Inject(REVIEW_TEMPLATE_REPOSITORY)
    private readonly templateRepository: ReviewTemplateRepository,
  ) {}

  async execute(userId: string): Promise<ReviewScopeResult> {
    const [technicianAssignments, representativeAssignments] =
      await Promise.all([
        this.technicianRepository.findActiveByUser(userId),
        this.representativeRepository.findActiveByUser(userId),
      ]);

    const communityIds = new Set<string>([
      ...technicianAssignments.map((assignment) => assignment.communityId),
      ...representativeAssignments.map((assignment) => assignment.communityId),
    ]);

    const communities: ReviewScopeCommunity[] = [];
    for (const communityId of communityIds) {
      const community = await this.communityRepository.findById(communityId);
      if (community) {
        communities.push({ id: community.id, name: community.name });
      }
    }

    const templates: ReviewScopeTemplate[] = [];
    for (const elementType of ELEMENT_TYPES) {
      const active =
        await this.templateRepository.findActiveByElementType(elementType);
      templates.push(
        ...active.map((template) => ({
          id: template.id,
          elementType: template.elementType,
          frequency: template.frequency,
          name: template.name,
        })),
      );
    }

    return { communities, templates };
  }
}
