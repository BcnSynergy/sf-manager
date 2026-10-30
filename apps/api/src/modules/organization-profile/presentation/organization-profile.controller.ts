import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  NotFoundException,
  Patch,
  PayloadTooLargeException,
  Put,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { updateOrganizationProfileSchema } from '@sf-manager/validation';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { GetOrganizationLogoUseCase } from '../application/use-cases/get-organization-logo.use-case';
import { GetOrganizationProfileUseCase } from '../application/use-cases/get-organization-profile.use-case';
import { UpdateOrganizationProfileUseCase } from '../application/use-cases/update-organization-profile.use-case';
import { UploadOrganizationLogoUseCase } from '../application/use-cases/upload-organization-logo.use-case';
import { RemoveOrganizationLogoUseCase } from '../application/use-cases/remove-organization-logo.use-case';
import {
  LogoTooLargeError,
  UnsupportedLogoFormatError,
} from '../domain/errors/organization-logo.errors';
import { OrganizationProfile } from '../domain/organization-profile.entity';
import type { OrganizationProfileErrorCode } from './organization-profile-error-code';
import {
  LogoFileInterceptor,
  logoFileMissingError,
} from './logo-file.interceptor';
import { LogoUploadErrorFilter } from './logo-upload-error.filter';
import type { UpdateOrganizationProfileRequestDto } from './dto/update-organization-profile-request.dto';
import { OrganizationProfileResponseDto } from './dto/organization-profile-response.dto';

// design.md Routes + Data Flow: every route sits behind AuthenticatedGuard
// (401 on no session) then PermissionsGuard (403 unless the caller's role
// has the route's @RequirePermission), both wired globally by AuthModule —
// this controller only declares the required permission per route
// (authorization spec "Permission Check on Organization Profile
// Endpoints"). Guards run before interceptors, so an unauthorized upload is
// rejected before its body is parsed. `OrganizationProfileMissingError`
// (thrown only by the adapter on a skipped migration) is deliberately left
// unmapped, surfacing as Nest's default 500 (design.md Decision 1).
//
// The profile read and update, plus the logo read, upload (organization-logo)
// and removal (EN-110) — no create, no delete of the profile, no `:id`
// variant (spec.md
// "The Profile Has No Create and No Delete Surface"). The logo upload's 400
// has two causes, so it carries a code (OrganizationProfileErrorCode).
@ApiTags('organization-profile')
@Controller('organization-profile')
export class OrganizationProfileController {
  constructor(
    private readonly getOrganizationProfileUseCase: GetOrganizationProfileUseCase,
    private readonly updateOrganizationProfileUseCase: UpdateOrganizationProfileUseCase,
    private readonly getOrganizationLogoUseCase: GetOrganizationLogoUseCase,
    private readonly uploadOrganizationLogoUseCase: UploadOrganizationLogoUseCase,
    private readonly removeOrganizationLogoUseCase: RemoveOrganizationLogoUseCase,
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

  @Get('logo')
  @RequirePermission('organizationProfile:read')
  @Header('Cache-Control', 'no-store')
  // EN-109: an SVG logo can carry scripts. The sandbox keeps them from
  // running if the URL is opened directly; nosniff keeps any logo from
  // being read as another type.
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
  @ApiOkResponse({
    description: 'The logo image.',
    headers: {
      'Content-Security-Policy': {
        description:
          "default-src 'none'; sandbox, so a script in an SVG logo never runs (EN-109).",
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': {
        description: 'nosniff',
        schema: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'The organization has no logo.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks organizationProfile:read.',
  })
  async getLogo(): Promise<StreamableFile> {
    const logo = await this.getOrganizationLogoUseCase.execute();
    if (!logo) throw new NotFoundException('The organization has no logo.');
    return new StreamableFile(logo.content, {
      type: logo.contentType,
      length: logo.content.length,
    });
  }

  // LogoFileInterceptor parses the form; its size limit and the form rules
  // (EN-111, TD-44) are documented there.
  @Put('logo')
  @RequirePermission('organizationProfile:update')
  @UseFilters(LogoUploadErrorFilter)
  @UseInterceptors(LogoFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: OrganizationProfileResponseDto })
  @ApiBadRequestResponse({
    description:
      'No file (LOGO_FILE_MISSING), not a PNG, JPEG, WebP or SVG image (LOGO_UNSUPPORTED_FORMAT), or a malformed form: the file in another field, a second file, a text field or a multipart type other than form-data (LOGO_UPLOAD_INVALID).',
  })
  @ApiPayloadTooLargeResponse({ description: 'The file is over 2 MiB.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks organizationProfile:update.',
  })
  async uploadLogo(
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<OrganizationProfileResponseDto> {
    if (!file) {
      throw logoFileMissingError();
    }
    try {
      const profile = await this.uploadOrganizationLogoUseCase.execute(
        file.buffer,
      );
      return OrganizationProfileController.toResponse(profile);
    } catch (error) {
      if (error instanceof UnsupportedLogoFormatError) {
        throw buildCodedError<OrganizationProfileErrorCode>(
          HttpStatus.BAD_REQUEST,
          error.message,
          'LOGO_UNSUPPORTED_FORMAT',
        );
      }
      if (error instanceof LogoTooLargeError) {
        throw new PayloadTooLargeException(error.message);
      }
      throw error;
    }
  }

  // EN-110: removes the logo; succeeds and changes nothing when there is none.
  @Delete('logo')
  @RequirePermission('organizationProfile:update')
  @ApiOkResponse({
    type: OrganizationProfileResponseDto,
    description:
      'The profile without its logo; when an upload recorded a new logo during the removal, the current profile, which normally has it (EN-114).',
  })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({
    description: 'Caller lacks organizationProfile:update.',
  })
  async removeLogo(): Promise<OrganizationProfileResponseDto> {
    const profile = await this.removeOrganizationLogoUseCase.execute();
    return OrganizationProfileController.toResponse(profile);
  }

  // Shared by every route that returns the profile — strips `logoAssetId`
  // (and any other domain-only field) so the storage key never leaks, even
  // as `null`; clients only learn whether a logo exists (`hasLogo`).
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
      hasLogo: profile.logoAssetId !== null,
    };
  }
}
