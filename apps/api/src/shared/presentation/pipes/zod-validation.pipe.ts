import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

// ADR-015: single source of truth for validation via Zod schemas shared
// with the web app (packages/validation) — class-validator DTO classes are
// rejected. Swagger documents the body separately via @ApiBody since
// Zod-inferred types carry no decorator metadata (design.md Interfaces).
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.issues);
    }
    return result.data;
  }
}
