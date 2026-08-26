import { describe, expect, it } from 'vitest';
import { mapAssignmentStatusToLabelKey } from './assignment-status-labels';

describe('mapAssignmentStatusToLabelKey', () => {
  it('maps deactivatedAt: null to community.assignment.status.active', () => {
    expect(mapAssignmentStatusToLabelKey(null)).toBe('community.assignment.status.active');
  });

  it('maps a real ISO timestamp to community.assignment.status.deactivated', () => {
    expect(mapAssignmentStatusToLabelKey('2026-08-26T10:00:00.000Z')).toBe(
      'community.assignment.status.deactivated',
    );
  });

  it('active and deactivated map to distinct keys', () => {
    const keys = new Set([
      mapAssignmentStatusToLabelKey(null),
      mapAssignmentStatusToLabelKey('2026-08-26T10:00:00.000Z'),
    ]);
    expect(keys.size).toBe(2);
  });
});
