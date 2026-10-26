import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  NotFoundException,
  Patch,
  PayloadTooLargeException,
  Put,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import {
  LogoTooLargeError,
  UnsupportedLogoFormatError,
} from '../domain/errors/organization-logo.errors';
import { LOGO_MAX_BYTES } from '../domain/organization-logo';
import { OrganizationProfile } from '../domain/organization-profile.entity';
import type { OrganizationProfileErrorCode } from './organization-profile-error-code';
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
// The profile read and update, plus the logo read and upload
// (organization-logo) — no create, no delete, no `:id` variant (spec.md
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
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ description: 'The logo image.' })
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

  // Multer keeps the file in memory and stops reading once it reaches its
  // fileSize limit, answering 413 itself. Busboy flags a file as too large
  // when it reaches exactly that limit, so the limit is LOGO_MAX_BYTES + 1
  // for a file of exactly LOGO_MAX_BYTES to pass; the use case enforces the
  // real maximum, so the rule does not depend on this interceptor.
  @Put('logo')
  @RequirePermission('organizationProfile:update')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: LOGO_MAX_BYTES + 1, files: 1 },
    }),
  )
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
      'No file (LOGO_FILE_MISSING), or not PNG, JPEG or WebP (LOGO_UNSUPPORTED_FORMAT).',
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
      throw buildCodedError<OrganizationProfileErrorCode>(
        HttpStatus.BAD_REQUEST,
        'A logo file is required in the "file" field.',
        'LOGO_FILE_MISSING',
      );
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
