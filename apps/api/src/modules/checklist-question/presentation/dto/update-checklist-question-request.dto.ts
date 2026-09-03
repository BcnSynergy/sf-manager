import type { UpdateChecklistQuestionRequest } from '@sf-manager/validation';

// ADR-015: Zod-inferred type — see
// create-checklist-question-request.dto.ts for the same rationale. Runtime
// validation via ZodValidationPipe(updateChecklistQuestionSchema).
export type UpdateChecklistQuestionRequestDto = UpdateChecklistQuestionRequest;
