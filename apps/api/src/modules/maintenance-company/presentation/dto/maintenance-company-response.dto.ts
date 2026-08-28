import { ApiProperty } from '@nestjs/swagger';

// design.md: response body shared by create/list/update — maintenance-
// company-management spec.md's entity shape is id, name, taxId, contactInfo
// (deletedAt is never returned — mirrors CommunityResponseDto/
// UserResponseDto).
export class MaintenanceCompanyResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  taxId!: string;

  @ApiProperty()
  contactInfo!: string;
}
