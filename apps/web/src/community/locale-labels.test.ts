import { describe, expect, it } from 'vitest';
import { mapLocaleToLabelKey } from './locale-labels';

describe('mapLocaleToLabelKey', () => {
  it('maps en to community.locale.en', () => {
    expect(mapLocaleToLabelKey('en')).toBe('community.locale.en');
  });

  it('maps es to community.locale.es', () => {
    expect(mapLocaleToLabelKey('es')).toBe('community.locale.es');
  });

  it('maps ca to community.locale.ca', () => {
    expect(mapLocaleToLabelKey('ca')).toBe('community.locale.ca');
  });
});
