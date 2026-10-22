import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAlertMessage } from './use-alert-message';

describe('useAlertMessage', () => {
  it('starts with no message', () => {
    const { result } = renderHook(() => useAlertMessage());

    expect(result.current.message).toBeNull();
  });

  it('shows and clears a message', () => {
    const { result } = renderHook(() => useAlertMessage());

    act(() => result.current.show('Name is required.'));
    expect(result.current.message).toBe('Name is required.');

    act(() => result.current.clear());
    expect(result.current.message).toBeNull();
  });

  // EN-76: a handler that clears the alert and shows the same text again in
  // one tick must still get a new key, so the alert element remounts.
  it('gives every show a new key, even for the same text cleared in the same tick', () => {
    const { result } = renderHook(() => useAlertMessage());

    act(() => result.current.show('Name is required.'));
    const firstKey = result.current.key;

    act(() => {
      result.current.clear();
      result.current.show('Name is required.');
    });

    expect(result.current.message).toBe('Name is required.');
    expect(result.current.key).not.toBe(firstKey);
  });

  it('keeps show and clear stable across renders', () => {
    const { result, rerender } = renderHook(() => useAlertMessage());
    const { show, clear } = result.current;

    act(() => result.current.show('Name is required.'));
    rerender();

    expect(result.current.show).toBe(show);
    expect(result.current.clear).toBe(clear);
  });
});
