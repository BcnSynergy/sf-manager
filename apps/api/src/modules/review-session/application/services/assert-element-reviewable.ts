import type { InspectableElementRepository } from '../../../inspectable-element/application/ports/inspectable-element.repository.port';
import { InspectableElementNotFoundError } from '../../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import type { ReviewTemplateRepository } from '../../../review-template/application/ports/review-template.repository.port';
import { ActiveTemplateNotFoundError } from '../../domain/errors/active-template-not-found.error';
import type { ReviewSession } from '../../domain/review-session.entity';

// Same scoping as RecordEntryUseCase: the element must be reviewable in the
// session's community and element type (the type comes from the frozen
// template snapshot). Unknown, foreign-community, decommissioned and
// soft-deleted elements are one InspectableElementNotFoundError.
export async function assertElementReviewable(
  templateRepository: ReviewTemplateRepository,
  elementRepository: InspectableElementRepository,
  session: ReviewSession,
  elementId: string,
): Promise<void> {
  const template = await templateRepository.findFrozenWithSnapshot(
    session.templateId,
  );
  if (!template) {
    throw new ActiveTemplateNotFoundError();
  }
  const element = await elementRepository.findReviewableById(
    session.communityId,
    template.elementType,
    elementId,
  );
  if (!element) {
    throw new InspectableElementNotFoundError();
  }
}
