import { act, screen } from '@testing-library/react';
import { expect } from 'vitest';
import i18n from '../i18n';

// EN-203: switches to Spanish and checks that the element now shows the
// Spanish text for `key`, then switches back to English even when the check
// fails, so the language never leaks into later tests. The Spanish text must
// differ from the English one: if the key were missing in Spanish, i18next
// would fall back to English and the check could not tell a translated alert
// from a stale one.
export async function expectAlertFollowsLanguage(testId: string, key: string) {
  const english = i18n.getFixedT('en')(key);
  const spanish = i18n.getFixedT('es')(key);
  expect(spanish).not.toBe(english);

  await act(() => i18n.changeLanguage('es'));
  try {
    expect(screen.getByTestId(testId)).toHaveTextContent(spanish);
  } finally {
    await act(() => i18n.changeLanguage('en'));
  }
}
