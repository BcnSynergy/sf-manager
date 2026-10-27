import { Inject, Injectable } from '@nestjs/common';
import {
  ORGANIZATION_LOGO_READER,
  type OrganizationLogo,
  type OrganizationLogoReader,
} from '../../../organization-profile/application/ports/organization-logo.reader.port';
import type { Actor } from '../services/session-access.service';
import { ReviewHistoryAccessService } from '../services/review-history-access.service';

// organization-logo S8, review-document "The Document Carries the
// Organization Logo": the same scope gate as ReadReviewDocumentUseCase
// FIRST, so a caller who cannot open the document gets the same 404 and the
// logo is never read. Resolves null when the organization has no logo.
@Injectable()
export class ReadReviewDocumentLogoUseCase {
  constructor(
    private readonly reviewHistoryAccessService: ReviewHistoryAccessService,
    @Inject(ORGANIZATION_LOGO_READER)
    private readonly logoReader: OrganizationLogoReader,
  ) {}

  async execute(
    sessionId: string,
    actor: Actor,
  ): Promise<OrganizationLogo | null> {
    await this.reviewHistoryAccessService.loadCompletedForActor(
      sessionId,
      actor,
    );
    return this.logoReader.execute();
  }
}
