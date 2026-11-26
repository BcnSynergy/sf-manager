import { ApiProperty } from '@nestjs/swagger';

// reviewer-signature, "Read the Own Signature Status". The storage key is
// never part of it.
export class OwnSignatureStatusDto {
  @ApiProperty({
    description: 'Whether the caller has registered a signature.',
  })
  hasSignature!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the current signature was uploaded; null without one.',
  })
  updatedAt!: string | null;
}
