import {
  Controller,
  Get,
  Header,
  HttpStatus,
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
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import {
  GetOwnSignatureStatusUseCase,
  type OwnSignatureStatus,
} from '../application/use-cases/get-own-signature-status.use-case';
import { ReadOwnSignatureImageUseCase } from '../application/use-cases/read-own-signature-image.use-case';
import { UploadOwnSignatureUseCase } from '../application/use-cases/upload-own-signature.use-case';
import {
  SignatureTooLargeError,
  UnsupportedSignatureFormatError,
} from '../domain/errors/reviewer-signature.errors';
import { OwnSignatureStatusDto } from './dto/own-signature-status.dto';
import type { ReviewerSignatureErrorCode } from './reviewer-signature-error-code';
import {
  SignatureFileInterceptor,
  signatureFileMissingError,
} from './signature-file.interceptor';
import { SignatureUploadErrorFilter } from './signature-upload-error.filter';

// reviewer-signature: the caller's OWN signature, addressed by the token's
// user id, never by a path parameter, so no route can reach another user's
// signature. Every route requires reviewSession:complete ("Only Users Who
// Sign Reviews Have a Signature"): signing a review is completing it.
@ApiTags('reviewer-signature')
@Controller('me/signature')
export class ReviewerSignatureController {
  constructor(
    private readonly getOwnSignatureStatusUseCase: GetOwnSignatureStatusUseCase,
    private readonly readOwnSignatureImageUseCase: ReadOwnSignatureImageUseCase,
    private readonly uploadOwnSignatureUseCase: UploadOwnSignatureUseCase,
  ) {}

  @Get()
  @RequirePermission('reviewSession:complete')
  @ApiOkResponse({ type: OwnSignatureStatusDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:complete.' })
  async status(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<OwnSignatureStatusDto> {
    return ReviewerSignatureController.toResponse(
      await this.getOwnSignatureStatusUseCase.execute(user.sub),
    );
  }

  @Get('image')
  @RequirePermission('reviewSession:complete')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ description: "The caller's signature image." })
  @ApiNotFoundResponse({
    description:
      'The caller has no signature, or its file is missing (SIGNATURE_NOT_FOUND).',
  })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:complete.' })
  async image(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<StreamableFile> {
    const image = await this.readOwnSignatureImageUseCase.execute(user.sub);
    if (!image) {
      throw buildCodedError<ReviewerSignatureErrorCode>(
        HttpStatus.NOT_FOUND,
        'You have no signature registered.',
        'SIGNATURE_NOT_FOUND',
      );
    }
    return new StreamableFile(image.content, {
      type: image.contentType,
      length: image.content.length,
    });
  }

  // SignatureFileInterceptor parses the form; its size limit and the form
  // rules are documented there.
  @Put()
  @RequirePermission('reviewSession:complete')
  @UseFilters(SignatureUploadErrorFilter)
  @UseInterceptors(SignatureFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ type: OwnSignatureStatusDto })
  @ApiBadRequestResponse({
    description:
      'No file (SIGNATURE_FILE_MISSING), not a PNG, JPEG or WebP image (SIGNATURE_UNSUPPORTED_FORMAT), or a malformed form (SIGNATURE_UPLOAD_INVALID).',
  })
  @ApiPayloadTooLargeResponse({
    description: 'The file is over 2 MiB (SIGNATURE_TOO_LARGE).',
  })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:complete.' })
  async upload(
    @CurrentUser() user: VerifiedAccessToken,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<OwnSignatureStatusDto> {
    if (!file) throw signatureFileMissingError();
    try {
      return ReviewerSignatureController.toResponse(
        await this.uploadOwnSignatureUseCase.execute(user.sub, file.buffer),
      );
    } catch (error) {
      if (error instanceof UnsupportedSignatureFormatError) {
        throw buildCodedError<ReviewerSignatureErrorCode>(
          HttpStatus.BAD_REQUEST,
          error.message,
          'SIGNATURE_UNSUPPORTED_FORMAT',
        );
      }
      if (error instanceof SignatureTooLargeError) {
        throw buildCodedError<ReviewerSignatureErrorCode>(
          HttpStatus.PAYLOAD_TOO_LARGE,
          error.message,
          'SIGNATURE_TOO_LARGE',
        );
      }
      throw error;
    }
  }

  private static toResponse(status: OwnSignatureStatus): OwnSignatureStatusDto {
    return {
      hasSignature: status.hasSignature,
      updatedAt: status.updatedAt?.toISOString() ?? null,
    };
  }
}
