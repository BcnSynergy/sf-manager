// Thrown by `RecordEntryUseCase` (design.md Decision 11, spec.md "Record
// an Element's Answers") when a submitted answer set does not exactly
// match the session template's frozen question snapshot — a missing
// snapshot question, an unknown question, or a duplicate all collapse to
// this same rejection. The presentation layer maps this to
// 400 { code: ANSWERS_DO_NOT_MATCH_TEMPLATE }.
export class AnswersDoNotMatchTemplateError extends Error {
  constructor() {
    super('Submitted answers do not match the session template');
    this.name = 'AnswersDoNotMatchTemplateError';
  }
}
