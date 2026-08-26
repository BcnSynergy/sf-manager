import { describe, expect, it } from 'vitest';
import { mapRoleToLabelKey } from './role-labels';

describe('mapRoleToLabelKey', () => {
  it('maps SYSTEM_ADMIN to users.role.systemAdmin', () => {
    expect(mapRoleToLabelKey('SYSTEM_ADMIN')).toBe('users.role.systemAdmin');
  });

  it('maps MANAGER to users.role.manager', () => {
    expect(mapRoleToLabelKey('MANAGER')).toBe('users.role.manager');
  });

  it('maps MAINTENANCE_COMPANY_MANAGER to users.role.maintenanceCompanyManager', () => {
    expect(mapRoleToLabelKey('MAINTENANCE_COMPANY_MANAGER')).toBe(
      'users.role.maintenanceCompanyManager',
    );
  });

  it('maps MAINTENANCE_TECHNICIAN to users.role.maintenanceTechnician', () => {
    expect(mapRoleToLabelKey('MAINTENANCE_TECHNICIAN')).toBe(
      'users.role.maintenanceTechnician',
    );
  });

  it('maps COMMUNITY_REPRESENTATIVE to users.role.communityRepresentative', () => {
    expect(mapRoleToLabelKey('COMMUNITY_REPRESENTATIVE')).toBe(
      'users.role.communityRepresentative',
    );
  });
});
