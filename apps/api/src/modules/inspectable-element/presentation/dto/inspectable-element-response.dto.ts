import { ApiProperty } from '@nestjs/swagger';

// design.md Data Flow: response body shared by create/list/update —
// inspectable-element-management spec.md's entity shape is id, communityId,
// elementType, name, description, location, serialNumber, installedAt
// (deletedAt is never returned — mirrors MaintenanceCompanyResponseDto/
// CommunityResponseDto). `installedAt` is the formatted 'YYYY-MM-DD' string
// (design.md Decision 3), not a raw Date.
export class InspectableElementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  communityId!: string;

  @ApiProperty()
  elementType!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  location!: string;

  @ApiProperty({ nullable: true, type: String })
  serialNumber!: string | null;

  @ApiProperty({ description: "ISO 'YYYY-MM-DD' calendar date." })
  installedAt!: string;

  // label-printing/design.md Decision 1 + Decision 8: application-generated,
  // immutable public identifier — server-generated on create, never accepted
  // as an input, never mutated by PATCH.
  @ApiProperty({ description: '10-character application-generated code.' })
  code!: string;
}
