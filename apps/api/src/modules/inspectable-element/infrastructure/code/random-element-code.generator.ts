import { randomInt } from 'node:crypto';
import { ElementCodeGenerator } from '../../application/ports/element-code-generator.port';
import {
  ELEMENT_CODE_ALPHABET,
  ELEMENT_CODE_LENGTH,
} from '../../domain/element-code';

// Adapter for ElementCodeGenerator (design.md Decision 3): `node:crypto`
// `randomInt` is rejection-sampled and unbiased, unlike `randomBytes` + `%
// 31` (256 % 31 !== 0, which would skew the first 8 alphabet symbols).
export class RandomElementCodeGenerator implements ElementCodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < ELEMENT_CODE_LENGTH; i++) {
      code += ELEMENT_CODE_ALPHABET[randomInt(0, ELEMENT_CODE_ALPHABET.length)];
    }
    return code;
  }
}
