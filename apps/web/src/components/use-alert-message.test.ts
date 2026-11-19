import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAlertMessage } from './use-alert-message';

describe('useAlertMessage', () => {
  // EN-210: the alert stores an i18n key and the page translates it on
  // render, so `show` only accepts a key from the English resources. Text
  // that is already translated, or a misspelled key, does not compile.
  it('accepts an i18n key and rejects anything else at compile time', () => {
    const { result } = renderHook(() => useAlertMessage());

    act(() => result.current.show('common.error.network'));
    expect(result.current.message).toBe('common.error.network');

    // @ts-expect-error translated text is not a message key
    act(() => result.current.show('Something went wrong. Please try again.'));
    // @ts-expect-error a misspelled key is not a message key
    act(() => result.current.show('common.error.netwrk'));
  });

  it('starts with no message', () => {
    const { result } = renderHook(() => useAlertMessage());

    expect(result.current.message).toBeNull();
  });

  it('shows and clears a message', () => {
    const { result } = renderHook(() => useAlertMessage());

    act(() => result.current.show('common.error.network'));
    expect(result.current.message).toBe('common.error.network');

    act(() => result.current.clear());
    expect(result.current.message).toBeNull();
  });

  // EN-76: a handler that clears the alert and shows the same text again in
  // one tick must still get a new key, so the alert element remounts.
  it('gives every show a new key, even for the same text cleared in the same tick', () => {
    const { result } = renderHook(() => useAlertMessage());

    act(() => result.current.show('common.error.network'));
    const firstKey = result.current.key;

    act(() => {
      result.current.clear();
      result.current.show('common.error.network');
    });

    expect(result.current.message).toBe('common.error.network');
    expect(result.current.key).not.toBe(firstKey);
  });

  it('keeps show and clear stable across renders', () => {
    const { result, rerender } = renderHook(() => useAlertMessage());
    const { show, clear } = result.current;

    act(() => result.current.show('common.error.network'));
    rerender();

    expect(result.current.show).toBe(show);
    expect(result.current.clear).toBe(clear);
  });
});
