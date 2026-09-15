import { BadRequestException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { UserCodedZodValidationPipe } from './user-coded-zod-validation.pipe';

// maintenance-company design.md Decision 5 / openspec/changes/maintenance-company/
// tasks.md 13.1, renamed per review-history-manager-capability/design.md
// Decision 6: Nest resolves a @Body() pipe during parameter binding,
// before UsersController's method body (and its try/catch, and
// mapMaintenanceCompanyError) ever runs — a plain ZodValidationPipe
// rejection for these tagged shapes therefore never carries a `code`. This
// pipe recognizes the schema's own `params.userErrorCode` tag (not by
// string-matching `message`) and attaches the matching UserErrorCode
// before throwing. A local minimal schema is used here (rather than
// importing createUserSchema) so this spec exercises the pipe's own
// tag-detection logic in isolation, for both the maintenance-company and
// manager-capability tag producers.
describe('UserCodedZodValidationPipe', () => {
  const schema = z
    .object({
      email: z.string().min(1),
      taggedCode: z
        .enum(['REQUIRED', 'NOT_ALLOWED', 'CAPABILITY_NOT_ALLOWED'])
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.taggedCode === 'REQUIRED') {
        ctx.addIssue({
          code: 'custom',
          path: ['maintenanceCompanyId'],
          message: 'Role "X" requires a maintenanceCompanyId',
          params: { userErrorCode: 'MAINTENANCE_COMPANY_REQUIRED' },
        });
      }
      if (data.taggedCode === 'NOT_ALLOWED') {
        ctx.addIssue({
          code: 'custom',
          path: ['maintenanceCompanyId'],
          message: 'Role "X" does not accept a maintenanceCompanyId',
          params: {
            userErrorCode: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
          },
        });
      }
      if (data.taggedCode === 'CAPABILITY_NOT_ALLOWED') {
        ctx.addIssue({
          code: 'custom',
          path: ['managerCapabilities'],
          message: 'Role "X" does not accept managerCapabilities',
          params: {
            userErrorCode: 'MANAGER_CAPABILITIES_NOT_ALLOWED',
          },
        });
      }
    });

  it('throws a coded exception with code MAINTENANCE_COMPANY_REQUIRED when the schema tags a REQUIRED issue', () => {
    const pipe = new UserCodedZodValidationPipe(schema);

    let thrown: unknown;
    try {
      pipe.transform({ email: 'a@example.com', taggedCode: 'REQUIRED' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'MAINTENANCE_COMPANY_REQUIRED',
      message: 'Role "X" requires a maintenanceCompanyId',
    });
  });

  it('throws a coded exception with code MAINTENANCE_COMPANY_NOT_ALLOWED when the schema tags a NOT_ALLOWED issue', () => {
    const pipe = new UserCodedZodValidationPipe(schema);

    let thrown: unknown;
    try {
      pipe.transform({ email: 'a@example.com', taggedCode: 'NOT_ALLOWED' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
      message: 'Role "X" does not accept a maintenanceCompanyId',
    });
  });

  it('throws a coded exception with code MANAGER_CAPABILITIES_NOT_ALLOWED when the schema tags a capability issue (design.md Decision 6 — second consumer)', () => {
    const pipe = new UserCodedZodValidationPipe(schema);

    let thrown: unknown;
    try {
      pipe.transform({
        email: 'a@example.com',
        taggedCode: 'CAPABILITY_NOT_ALLOWED',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      code: 'MANAGER_CAPABILITIES_NOT_ALLOWED',
      message: 'Role "X" does not accept managerCapabilities',
    });
  });

  it('falls through to the generic BadRequestException for a schema failure unrelated to any tagged field', () => {
    const pipe = new UserCodedZodValidationPipe(schema);

    expect(() => pipe.transform({ email: '' })).toThrow(BadRequestException);
    try {
      pipe.transform({ email: '' });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).not.toHaveProperty('code');
    }
  });

  it('passes a valid payload through unchanged', () => {
    const pipe = new UserCodedZodValidationPipe(schema);

    expect(pipe.transform({ email: 'a@example.com' })).toEqual({
      email: 'a@example.com',
    });
  });
});
