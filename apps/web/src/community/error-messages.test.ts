import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { mapApiErrorToMessageKey } from './error-messages';

describe('mapApiErrorToMessageKey (community)', () => {
  it('maps ASSIGNMENT_ALREADY_EXISTS to community.error.assignmentExists', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'ASSIGNMENT_ALREADY_EXISTS'))).toBe(
      'community.error.assignmentExists',
    );
  });

  it('maps INELIGIBLE_ROLE to community.error.ineligibleRole', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'INELIGIBLE_ROLE'))).toBe(
      'community.error.ineligibleRole',
    );
  });

  it('maps TRANSACTION_CONFLICT to community.error.tryAgain', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'TRANSACTION_CONFLICT'))).toBe(
      'community.error.tryAgain',
    );
  });

  it('the three assignment 409 codes map to three distinct keys', () => {
    const keys = new Set([
      mapApiErrorToMessageKey(new ApiError(409, 'ASSIGNMENT_ALREADY_EXISTS')),
      mapApiErrorToMessageKey(new ApiError(409, 'INELIGIBLE_ROLE')),
      mapApiErrorToMessageKey(new ApiError(409, 'TRANSACTION_CONFLICT')),
    ]);
    expect(keys.size).toBe(3);
  });

  it('maps a 400 with no code to community.error.validationFailed', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400))).toBe('community.error.validationFailed');
  });

  it('maps a 404 (assign/deactivate/reactivate) to the generic community.error.assignmentTargetNotFound', () => {
    // Generic Not-Found Handling on Assignment Actions (spec): unknown
    // community, unknown/ineligible userId, and a stale assignment
    // reference all collapse to the same message — the mapper cannot and
    // must not distinguish them.
    expect(mapApiErrorToMessageKey(new ApiError(404))).toBe(
      'community.error.assignmentTargetNotFound',
    );
  });

  it('maps status 0 (network/parse failure) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(0))).toBe('common.error.network');
  });

  it('maps an unrecognized status (e.g. 500) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(500))).toBe('common.error.network');
  });

  it('maps a 409 with an unrecognized code to common.error.network', () => {
    // Defensive fallback: a 409 on these routes must always carry one of
    // the 3 known codes per the community-assignments spec delta, but the
    // mapper must not throw or silently pick a wrong specific message if
    // that contract is ever violated.
    expect(
      mapApiErrorToMessageKey(new ApiError(409, 'SOMETHING_UNKNOWN' as never)),
    ).toBe('common.error.network');
  });

  it('never branches on error.message text — the mapping only reads status/code', () => {
    // Guards "No Server-Message String Coupling" (spec requirement):
    // construct two ApiErrors with the same status/code but wildly
    // different `.message` strings and assert the mapped key is identical
    // either way. A naive implementation that does
    // `error.message.includes(...)` would diverge here.
    const withOneMessage = new ApiError(409, 'ASSIGNMENT_ALREADY_EXISTS');
    const withDifferentMessage = new ApiError(409, 'ASSIGNMENT_ALREADY_EXISTS');
    Object.defineProperty(withDifferentMessage, 'message', {
      value: 'Totally unrelated server prose that would break substring matching',
    });

    expect(mapApiErrorToMessageKey(withOneMessage)).toBe(
      mapApiErrorToMessageKey(withDifferentMessage),
    );
  });
});
