import { describe, expect, it } from 'vitest';
import { createUserSchema } from './create-user.schema';
import { updateUserSchema } from './update-user.schema';

// review-history-manager-capability/design.md Decision 6 (tasks.md 3.5):
// updateUserSchema gains an optional `managerCapabilities`, gated by a
// NOT_ALLOWED refinement that fires only when `role` is present AND the
// supplied array is non-empty. createUserSchema's parse behaviour stays
// unchanged (proposal non-goal — granting is edit-only).
describe('updateUserSchema — managerCapabilities', () => {
  it('accepts an empty array', () => {
    const result = updateUserSchema.safeParse({ managerCapabilities: [] });
    expect(result.success).toBe(true);
  });

  it('accepts a payload carrying the one declared capability', () => {
    const result = updateUserSchema.safeParse({
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown capability member', () => {
    const result = updateUserSchema.safeParse({
      managerCapabilities: ['MANAGE_COMMUNITIES'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a payload with no managerCapabilities field at all', () => {
    const result = updateUserSchema.safeParse({ email: 'a@example.com' });
    expect(result.success).toBe(true);
  });

  it('does not fire the NOT_ALLOWED refinement when role is absent, even with a non-empty array on a would-be non-MANAGER resulting role', () => {
    // The schema cannot see the existing role, so this shape is only
    // decidable resulting-state-side (UpdateUserUseCase, not this schema) —
    // design.md Decision 6's documented asymmetry.
    const result = updateUserSchema.safeParse({
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects when role is present, non-MANAGER, and managerCapabilities is a non-empty array', () => {
    const result = updateUserSchema.safeParse({
      role: 'SYSTEM_ADMIN',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === 'managerCapabilities',
      );
      expect(issue).toBeDefined();
      expect(
        (issue as { params?: { userErrorCode?: string } }).params
          ?.userErrorCode,
      ).toBe('MANAGER_CAPABILITIES_NOT_ALLOWED');
    }
  });

  it('does NOT reject when role is present, non-MANAGER, and managerCapabilities is an explicit empty array (revoke is always legal)', () => {
    const result = updateUserSchema.safeParse({
      role: 'SYSTEM_ADMIN',
      managerCapabilities: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts when role is present and MANAGER with a non-empty array', () => {
    const result = updateUserSchema.safeParse({
      role: 'MANAGER',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(result.success).toBe(true);
  });

  it('picks the maintenance-company refinement first when a payload violates both tagged refinements at once (design.md Decision 6 precedence)', () => {
    const result = updateUserSchema.safeParse({
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: 'company-1',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstIssue = result.error.issues[0] as {
        params?: { userErrorCode?: string };
      };
      expect(firstIssue.params?.userErrorCode).toBe(
        'MAINTENANCE_COMPANY_NOT_ALLOWED',
      );
    }
  });
});

describe('createUserSchema — unchanged parse behaviour (tag-key rename only)', () => {
  it('still accepts a valid maintenance-side payload', () => {
    const result = createUserSchema.safeParse({
      email: 'a@example.com',
      password: 'a-very-strong-password-1',
      role: 'MAINTENANCE_TECHNICIAN',
      maintenanceCompanyId: 'company-1',
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a non-maintenance role carrying a maintenanceCompanyId, tagged with userErrorCode', () => {
    const result = createUserSchema.safeParse({
      email: 'a@example.com',
      password: 'a-very-strong-password-1',
      role: 'SYSTEM_ADMIN',
      maintenanceCompanyId: 'company-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as {
        params?: { userErrorCode?: string };
      };
      expect(issue.params?.userErrorCode).toBe(
        'MAINTENANCE_COMPANY_NOT_ALLOWED',
      );
    }
  });

  it('has no managerCapabilities field in its shape', () => {
    const parsed = createUserSchema.safeParse({
      email: 'a@example.com',
      password: 'a-very-strong-password-1',
      role: 'MANAGER',
      managerCapabilities: ['VIEW_ALL_REVIEWS'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).managerCapabilities).toBeUndefined();
    }
  });
});
