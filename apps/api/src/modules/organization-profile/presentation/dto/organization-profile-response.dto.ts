import { ApiProperty } from '@nestjs/swagger';

// design.md: response body shared by GET/PATCH — organization-profile-
// management spec.md's entity shape is id, name, legalName, taxId, address,
// phone, email. `logoAssetId` is DELIBERATELY OMITTED — not exposed even as
// `null` (spec.md "logoAssetId Is Reserved, Unwritable and Absent From the
// API"): a permanently-null field would teach clients to depend on a
// contract that has no meaning yet.
export class OrganizationProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  legalName!: string;

  @ApiProperty()
  taxId!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  email!: string;
}
