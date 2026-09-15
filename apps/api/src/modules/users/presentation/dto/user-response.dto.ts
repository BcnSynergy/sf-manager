import { ApiProperty } from '@nestjs/swagger';
import type { ManagerCapability } from '../../domain/manager-capability';
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

  // maintenance-company design.md Decision 7: the web resolves this id to
  // a company NAME client-side via its own GET /maintenance-companies list
  // — this DTO carries only the id, never a joined name (spec.md
  // "Maintenance Company Rendered By Name" is a Phase 11 web concern).
  @ApiProperty({ nullable: true, type: String })
  maintenanceCompanyId!: string | null;

  // review-history-manager-capability/design.md OQ1/Decision 6: shared by
  // create/list/update — there is no `GET /users/:id`, so the edit form
  // prefills the capability toggle from this same field via `listUsers()`.
  // Always an array, `[]` for every non-MANAGER user.
  @ApiProperty({ enum: ['VIEW_ALL_REVIEWS'], isArray: true })
  managerCapabilities!: ManagerCapability[];
}
