import { BadRequestException, HttpException } from '@nestjs/common';
import { z } from 'zod';
import { MaintenanceCompanyZodValidationPipe } from './maintenance-company-zod-validation.pipe';

// maintenance-company design.md Decision 5 / openspec/changes/maintenance-company/
// tasks.md 13.1: Nest resolves a @Body() pipe during parameter binding,
// before UsersController's method body (and its try/catch, and
// mapMaintenanceCompanyError) ever runs — a plain ZodValidationPipe
// rejection for these 2 maintenanceCompanyId shapes therefore never carries
// a `code`. This pipe recognizes the schema's own
// `params.maintenanceCompanyCode` tag (not by string-matching `message`)
// and attaches the matching UserErrorCode before throwing. A local minimal
// schema is used here (rather than importing createUserSchema) so this
// spec exercises the pipe's own tag-detection logic in isolation.
describe('MaintenanceCompanyZodValidationPipe', () => {
  const schema = z
    .object({
      email: z.string().min(1),
      taggedCode: z.enum(['REQUIRED', 'NOT_ALLOWED']).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.taggedCode === 'REQUIRED') {
        ctx.addIssue({
          code: 'custom',
          path: ['maintenanceCompanyId'],
          message: 'Role "X" requires a maintenanceCompanyId',
          params: { maintenanceCompanyCode: 'MAINTENANCE_COMPANY_REQUIRED' },
        });
      }
      if (data.taggedCode === 'NOT_ALLOWED') {
        ctx.addIssue({
          code: 'custom',
          path: ['maintenanceCompanyId'],
          message: 'Role "X" does not accept a maintenanceCompanyId',
          params: {
            maintenanceCompanyCode: 'MAINTENANCE_COMPANY_NOT_ALLOWED',
          },
        });
      }
    });

  it('throws a coded exception with code MAINTENANCE_COMPANY_REQUIRED when the schema tags a REQUIRED issue', () => {
    const pipe = new MaintenanceCompanyZodValidationPipe(schema);

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
    const pipe = new MaintenanceCompanyZodValidationPipe(schema);

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

  it('falls through to the generic BadRequestException for a schema failure unrelated to maintenanceCompanyId', () => {
    const pipe = new MaintenanceCompanyZodValidationPipe(schema);

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
    const pipe = new MaintenanceCompanyZodValidationPipe(schema);

    expect(pipe.transform({ email: 'a@example.com' })).toEqual({
      email: 'a@example.com',
    });
  });
});
