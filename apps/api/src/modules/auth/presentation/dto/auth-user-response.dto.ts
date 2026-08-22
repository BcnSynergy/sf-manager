import { ApiProperty } from '@nestjs/swagger';
import type { Role } from '../../../users/domain/role';

// design.md: response body shared by login and GET /auth/me — never the
// password hash, never the raw token, only public identity fields. `role`
// (PR 7, breaking change — authentication spec.md delta "Session
// Introspection") is part of that shared public identity shape.
export class AuthUserResponseDto {
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
