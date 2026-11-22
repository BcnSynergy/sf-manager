import { ApiProperty } from '@nestjs/swagger';

// EN-164 T3: one photo of a completed review in the history. No storage key,
// ever.
export class ReviewHistoryPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  inspectableElementId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
