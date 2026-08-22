import { ApiProperty } from '@nestjs/swagger';
import type { Role } from '../../domain/role';

// design.md: response body shared by create/list/update — never the
// password hash (spec.md "Create User" / "List Users" scenarios).
export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({
    enum: [
      'SYSTEM_ADMIN',
      'MANAGER',
      'MAINTENANCE_COMPANY_MANAGER',
      'MAINTENANCE_TECHNICIAN',
      'COMMUNITY_REPRESENTATIVE',
    ],
  })
  role!: Role;
}
