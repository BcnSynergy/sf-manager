import { describe, expect, it } from 'vitest';
import { mapAnswerValueToLabelKey } from './answer-value-labels';

describe('mapAnswerValueToLabelKey', () => {
  it('maps each AnswerValue to a distinct i18n key', () => {
    const keys = new Set([
      mapAnswerValueToLabelKey('YES'),
      mapAnswerValueToLabelKey('NO'),
      mapAnswerValueToLabelKey('NOT_APPLICABLE'),
    ]);
    expect(keys.size).toBe(3);
    expect(mapAnswerValueToLabelKey('YES')).toBe('reviewSession.answer.yes');
    expect(mapAnswerValueToLabelKey('NO')).toBe('reviewSession.answer.no');
    expect(mapAnswerValueToLabelKey('NOT_APPLICABLE')).toBe('reviewSession.answer.notApplicable');
  });
});
