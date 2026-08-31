import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { mapApiErrorToMessageKey } from './error-messages';

describe('mapApiErrorToMessageKey', () => {
  it('maps EMAIL_ALREADY_IN_USE to users.error.duplicateEmail', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'EMAIL_ALREADY_IN_USE'))).toBe(
      'users.error.duplicateEmail',
    );
  });

  it('maps LAST_SYSTEM_ADMIN to users.error.lastSystemAdmin', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'LAST_SYSTEM_ADMIN'))).toBe(
      'users.error.lastSystemAdmin',
    );
  });

  it('maps TRANSACTION_CONFLICT to users.error.tryAgain', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'TRANSACTION_CONFLICT'))).toBe(
      'users.error.tryAgain',
    );
  });

  it('maps a 400 MAINTENANCE_COMPANY_REQUIRED to users.error.maintenanceCompanyRequired', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400, 'MAINTENANCE_COMPANY_REQUIRED'))).toBe(
      'users.error.maintenanceCompanyRequired',
    );
  });

  it('maps a 400 MAINTENANCE_COMPANY_NOT_ALLOWED to users.error.maintenanceCompanyNotAllowed', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_ALLOWED'))).toBe(
      'users.error.maintenanceCompanyNotAllowed',
    );
  });

  it('maps a 400 MAINTENANCE_COMPANY_NOT_FOUND to users.error.maintenanceCompanyNotFound', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400, 'MAINTENANCE_COMPANY_NOT_FOUND'))).toBe(
      'users.error.maintenanceCompanyNotFound',
    );
  });

  it('maps a 400 with no code to users.error.weakPassword', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400))).toBe('users.error.weakPassword');
  });

  it('maps a 404 to users.error.notFound', () => {
    expect(mapApiErrorToMessageKey(new ApiError(404))).toBe('users.error.notFound');
  });

  it('maps status 0 (network/parse failure) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(0))).toBe('common.error.network');
  });

  it('maps an unrecognized status (e.g. 500) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(500))).toBe('common.error.network');
  });

  it('maps a 409 with an unrecognized code to common.error.network', () => {
    // Defensive fallback: a 409 must always carry one of the 3 known codes
    // per the user-management spec delta, but the mapper must not throw or
    // silently pick a wrong specific message if that contract is ever violated.
    expect(
      mapApiErrorToMessageKey(new ApiError(409, 'SOMETHING_UNKNOWN' as never)),
    ).toBe('common.error.network');
  });

  it('never branches on error.message text — the mapping only reads status/code', () => {
    // Guards "No Server-Message String Coupling" (spec requirement): construct
    // two ApiErrors with the same status/code but wildly different `.message`
    // strings and assert the mapped key is identical either way. A naive
    // implementation that does `error.message.includes(...)` would diverge here.
    const withOneMessage = new ApiError(409, 'LAST_SYSTEM_ADMIN');
    const withDifferentMessage = new ApiError(409, 'LAST_SYSTEM_ADMIN');
    Object.defineProperty(withDifferentMessage, 'message', {
      value: 'Totally unrelated server prose that would break substring matching',
    });

    expect(mapApiErrorToMessageKey(withOneMessage)).toBe(
      mapApiErrorToMessageKey(withDifferentMessage),
    );
  });
});
