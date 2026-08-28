import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { mapApiErrorToMessageKey } from './error-messages';

describe('mapApiErrorToMessageKey (maintenance-company)', () => {
  it('maps TAX_ID_ALREADY_IN_USE to maintenanceCompany.error.duplicateTaxId', () => {
    expect(mapApiErrorToMessageKey(new ApiError(409, 'TAX_ID_ALREADY_IN_USE'))).toBe(
      'maintenanceCompany.error.duplicateTaxId',
    );
  });

  it('maps MAINTENANCE_COMPANY_HAS_ACTIVE_USERS to maintenanceCompany.error.hasActiveUsers', () => {
    expect(
      mapApiErrorToMessageKey(new ApiError(409, 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS')),
    ).toBe('maintenanceCompany.error.hasActiveUsers');
  });

  it('the two codes map to two distinct keys (spec: distinguishable from each other)', () => {
    const keys = new Set([
      mapApiErrorToMessageKey(new ApiError(409, 'TAX_ID_ALREADY_IN_USE')),
      mapApiErrorToMessageKey(new ApiError(409, 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS')),
    ]);
    expect(keys.size).toBe(2);
  });

  it('maps a 400 with no code to maintenanceCompany.error.validationFailed', () => {
    expect(mapApiErrorToMessageKey(new ApiError(400))).toBe(
      'maintenanceCompany.error.validationFailed',
    );
  });

  it('maps a 404 to maintenanceCompany.error.notFound', () => {
    expect(mapApiErrorToMessageKey(new ApiError(404))).toBe('maintenanceCompany.error.notFound');
  });

  it('maps status 0 (network/parse failure) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(0))).toBe('common.error.network');
  });

  it('maps an unrecognized status (e.g. 500) to common.error.network', () => {
    expect(mapApiErrorToMessageKey(new ApiError(500))).toBe('common.error.network');
  });

  it('maps a 409 with an unrecognized code to common.error.network', () => {
    expect(
      mapApiErrorToMessageKey(new ApiError(409, 'SOMETHING_UNKNOWN' as never)),
    ).toBe('common.error.network');
  });

  it('never branches on error.message text — the mapping only reads status/code', () => {
    // Guards "No Server-Message String Coupling" (spec requirement).
    const withOneMessage = new ApiError(409, 'TAX_ID_ALREADY_IN_USE');
    const withDifferentMessage = new ApiError(409, 'TAX_ID_ALREADY_IN_USE');
    Object.defineProperty(withDifferentMessage, 'message', {
      value: 'Totally unrelated server prose that would break substring matching',
    });

    expect(mapApiErrorToMessageKey(withOneMessage)).toBe(
      mapApiErrorToMessageKey(withDifferentMessage),
    );
  });
});
