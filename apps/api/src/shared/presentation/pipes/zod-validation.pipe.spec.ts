import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

// ADR-015: Zod is the single source of truth for validation — no
// class-validator DTO classes. This generic pipe wraps any Zod schema so
// controllers stay declarative (`@Body(new ZodValidationPipe(schema))`).
describe('ZodValidationPipe', () => {
  const schema = z.object({ email: z.string().min(1) });

  it('returns the parsed value when it matches the schema', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ email: 'admin@example.com' })).toEqual({
      email: 'admin@example.com',
    });
  });

  it('throws BadRequestException when the value fails schema validation', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ email: '' })).toThrow(BadRequestException);
  });
});
