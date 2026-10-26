import { ApiProperty } from '@nestjs/swagger';

// design.md: response body shared by GET/PATCH and the logo upload —
// organization-profile-management spec.md's shape is id, name, legalName,
// taxId, address, phone, email and hasLogo. `logoAssetId` is DELIBERATELY
// OMITTED — not exposed even as `null`: it is a storage key, and clients
// read the logo itself from GET /organization-profile/logo.
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

  @ApiProperty({ description: 'Whether a logo has been uploaded.' })
  hasLogo!: boolean;
}
