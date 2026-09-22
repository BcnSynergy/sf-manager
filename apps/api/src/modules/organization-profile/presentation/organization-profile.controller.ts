import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { updateOrganizationProfileSchema } from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { GetOrganizationProfileUseCase } from '../application/use-cases/get-organization-profile.use-case';
import { UpdateOrganizationProfileUseCase } from '../application/use-cases/update-organization-profile.use-case';
import { OrganizationProfile } from '../domain/organization-profile.entity';
import type { UpdateOrganizationProfileRequestDto } from './dto/update-organization-profile-request.dto';
import { OrganizationProfileResponseDto } from './dto/organization-profile-response.dto';

// design.md Routes + Data Flow: every route sits behind AuthenticatedGuard
// (401 on no session) then PermissionsGuard (403 unless the caller's role
// has the route's @RequirePermission), both wired globally by AuthModule —
// this controller only declares the required permission per route
// (authorization spec "Permission Check on Organization Profile
// Endpoints"). Mirrors MaintenanceCompanyController, minus error mapping:
// design.md Decision 4 — zero statuses on this module have more than one
// reachable cause, so there is no buildCodedError, no error-code file, and
// no try/catch here. `OrganizationProfileMissingError` (thrown only by the
// adapter on a skipped migration) is deliberately left unmapped, surfacing
// as Nest's default 500 (design.md Decision 1).
//
// Only two routes — no create, no delete, no `:id` variant (spec.md "The
// Profile Has No Create and No Delete Surface").
@ApiTags('organization-profile')
@Controller('organization-profile')
export class OrganizationProfileController {
  constructor(
    private readonly getOrganizationProfileUseCase: GetOrganizationProfileUseCase,
    private readonly updateOrganizationProfileUseCase: UpdateOrganizationProfileUseCase,
  ) {}

  @Get()
  @RequirePermission('organizationProfile:read')
  @ApiOkResponse({ type: OrganizationProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks organizationProfile:read.',
  })
  async get(): Promise<OrganizationProfileResponseDto> {
    const profile = await this.getOrganizationProfileUseCase.execute();
    return OrganizationProfileController.toResponse(profile);
  }

  @Patch()
  @RequirePermission('organizationProfile:update')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        legalName: { type: 'string' },
        taxId: { type: 'string' },
        address: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
      },
    },
  })
  @ApiOkResponse({ type: OrganizationProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks organizationProfile:update.',
  })
  async update(
    @Body(new ZodValidationPipe(updateOrganizationProfileSchema))
    body: UpdateOrganizationProfileRequestDto,
  ): Promise<OrganizationProfileResponseDto> {
    const profile = await this.updateOrganizationProfileUseCase.execute(body);
    return OrganizationProfileController.toResponse(profile);
  }

  // Shared by get() and update() — strips `logoAssetId` (and any other
  // domain-only field) so the response DTO can never accidentally leak it,
  // even as `null` (spec.md "logoAssetId Is Reserved, Unwritable and Absent
  // From the API").
  private static toResponse(
    profile: OrganizationProfile,
  ): OrganizationProfileResponseDto {
    return {
      id: profile.id,
      name: profile.name,
      legalName: profile.legalName,
      taxId: profile.taxId,
      address: profile.address,
      phone: profile.phone,
      email: profile.email,
    };
  }
}
