import { ApiProperty } from '@nestjs/swagger';
import type { Locale } from '../../domain/community.entity';

// design.md: response body shared by create/list/update — community-
// management spec.md's entity shape is exactly id, name, address, locale
// (no deletedAt exposed to the caller, mirrors UserResponseDto).
export class CommunityResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty({ enum: ['en', 'es', 'ca'] })
  locale!: Locale;
}
