import { Inject, Injectable } from '@nestjs/common';
import {
  REVIEWER_SIGNATURE_REPOSITORY,
  type ReviewerSignatureRepository,
} from '../ports/reviewer-signature.repository.port';

export type OwnSignatureStatus =
  | { hasSignature: true; updatedAt: Date }
  | { hasSignature: false; updatedAt: null };

// reviewer-signature, "Read the Own Signature Status". The storage key never
// leaves the API.
@Injectable()
export class GetOwnSignatureStatusUseCase {
  constructor(
    @Inject(REVIEWER_SIGNATURE_REPOSITORY)
    private readonly repository: ReviewerSignatureRepository,
  ) {}

  async execute(userId: string): Promise<OwnSignatureStatus> {
    const signature = await this.repository.findByUserId(userId);
    return signature
      ? { hasSignature: true, updatedAt: signature.updatedAt }
      : { hasSignature: false, updatedAt: null };
  }
}
