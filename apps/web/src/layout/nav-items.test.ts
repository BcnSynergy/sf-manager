import { describe, expect, it } from 'vitest';
import type { Role } from '@sf-manager/validation';
import { groupNavItems, NAV_ITEMS_BY_ROLE } from './nav-items';

// app-navigation delta "The Role → Navigation Items Map Is Exhaustive and
// Fixed": Home first and ungrouped, then Operations, Setup, Administration;
// a group with no items for the role is omitted.
const EXPECTED_SECTIONS: Record<Role, [string | null, string[]][]> = {
  SYSTEM_ADMIN: [
    [null, ['nav-link-home']],
    ['operations', ['nav-link-review-schedule', 'nav-link-review-history']],
    [
      'setup',
      [
        'nav-link-communities',
        'nav-link-maintenance-companies',
        'nav-link-review-templates',
        'nav-link-checklist-questions',
      ],
    ],
    ['administration', ['nav-link-users', 'nav-link-organization-profile']],
  ],
  MANAGER: [
    [null, ['nav-link-home']],
    ['operations', ['nav-link-review-schedule', 'nav-link-review-history']],
  ],
  MAINTENANCE_COMPANY_MANAGER: [
    [null, ['nav-link-home']],
    ['operations', ['nav-link-review-history']],
  ],
  MAINTENANCE_TECHNICIAN: [
    [null, ['nav-link-home']],
    [
      'operations',
      ['nav-link-review-schedule', 'nav-link-review-sessions', 'nav-link-review-history'],
    ],
  ],
  COMMUNITY_REPRESENTATIVE: [
    [null, ['nav-link-home']],
    [
      'operations',
      ['nav-link-review-schedule', 'nav-link-review-sessions', 'nav-link-review-history'],
    ],
  ],
};

describe('groupNavItems', () => {
  it.each(Object.entries(EXPECTED_SECTIONS) as [Role, [string | null, string[]][]][])(
    '%s gets the spec sections in order, empty groups omitted',
    (role, expected) => {
      const sections = groupNavItems(NAV_ITEMS_BY_ROLE[role]);
      expect(
        sections.map((section) => [section.group, section.items.map((item) => item.testId)]),
      ).toEqual(expected);
    },
  );

  it('keeps the flat item order of each role equal to the sections read in order', () => {
    for (const role of Object.keys(NAV_ITEMS_BY_ROLE) as Role[]) {
      const flat = NAV_ITEMS_BY_ROLE[role].map((item) => item.testId);
      const fromSections = groupNavItems(NAV_ITEMS_BY_ROLE[role]).flatMap((section) =>
        section.items.map((item) => item.testId),
      );
      expect(fromSections).toEqual(flat);
    }
  });

  it('returns no sections for an empty item list', () => {
    expect(groupNavItems([])).toEqual([]);
  });
});
