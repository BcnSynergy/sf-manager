import { ApiProperty } from '@nestjs/swagger';

// design.md: response body shared by login and GET /auth/me — never the
// password hash, never the raw token, only public identity fields.
export class AuthUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;
}
