import {
  ELEMENT_CODE_ALPHABET,
  ELEMENT_CODE_LENGTH,
  elementCodeSchema,
} from '@sf-manager/validation';

// design.md Decision 1 + Decision 2: `code` is a plain field, not a Value
// Object — this module only re-exports the single alphabet/length
// declaration (packages/validation) and exposes a format predicate derived
// from that same schema, mirroring the pure-function shape of
// `installed-at.ts` (no VO, per ADR-006).
export { ELEMENT_CODE_ALPHABET, ELEMENT_CODE_LENGTH };

export function isElementCode(value: string): boolean {
  return elementCodeSchema.safeParse(value).success;
}
