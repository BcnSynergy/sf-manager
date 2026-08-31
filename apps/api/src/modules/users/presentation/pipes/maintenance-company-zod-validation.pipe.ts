import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodIssue, ZodType } from 'zod';
import { buildCodedError } from '../../../../shared/presentation/http/coded-error';
import { ZodValidationPipe } from '../../../../shared/presentation/pipes/zod-validation.pipe';
import type { UserErrorCode } from '../user-error-code';

type TaggedMaintenanceCompanyIssue = Extract<ZodIssue, { code: 'custom' }> & {
  params: { maintenanceCompanyCode: string };
};

function isTaggedMaintenanceCompanyIssue(
  issue: ZodIssue,
): issue is TaggedMaintenanceCompanyIssue {
  return (
    issue.code === 'custom' &&
    typeof issue.params?.maintenanceCompanyCode === 'string'
  );
}

// users-module-local (not shared-pipe knowledge, per this repo's Clean
// Architecture boundaries): Nest resolves a @Body() pipe during parameter
// binding, BEFORE UsersController's method body runs — so a plain
// ZodValidationPipe rejection never reaches the controller's own try/catch
// (and therefore never reaches mapMaintenanceCompanyError, which is what
// normally attaches `code: MAINTENANCE_COMPANY_REQUIRED`/
// `MAINTENANCE_COMPANY_NOT_ALLOWED`). This subclass closes that gap for the
// 2 maintenanceCompanyId shapes that ARE payload-decidable (REQUIRED on
// create, NOT_ALLOWED on create/update) by recognizing the schema's own
// `params.maintenanceCompanyCode` tag (createMaintenanceCompanyRefinement /
// applyMaintenanceCompanyNotAllowedRefinement in
// packages/validation/src/users/create-user.schema.ts) — not by
// string-matching the Zod issue's `message` — and raising the same
// `{statusCode, error, message, code}` shape buildCodedError already
// produces for the resulting-state-checked cases. Any other schema failure
// (or a schema failure that isn't tagged) falls through unchanged to
// ZodValidationPipe's generic BadRequestException. See
// openspec/changes/maintenance-company/tasks.md's 13.1 finding.
export class MaintenanceCompanyZodValidationPipe
  extends ZodValidationPipe
  implements PipeTransform
{
  constructor(schema: ZodType) {
    super(schema);
  }

  override transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const taggedIssue = result.error.issues.find(
        isTaggedMaintenanceCompanyIssue,
      );
      if (taggedIssue) {
        throw buildCodedError(
          HttpStatus.BAD_REQUEST,
          taggedIssue.message,
          taggedIssue.params.maintenanceCompanyCode as UserErrorCode,
        );
      }
    }
    return super.transform(value);
  }
}
