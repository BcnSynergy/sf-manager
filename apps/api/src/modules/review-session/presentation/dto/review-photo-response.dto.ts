import { ApiProperty } from '@nestjs/swagger';

// EN-164: no storage key, ever.
export class ReviewPhotoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
