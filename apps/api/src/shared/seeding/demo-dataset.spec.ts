import {
  createChecklistQuestionSchema,
  createCommunitySchema,
  createInspectableElementSchema,
  createMaintenanceCompanySchema,
  elementCodeSchema,
  passwordSchema,
  updateOrganizationProfileSchema,
} from '@sf-manager/validation';
import { detectLogoFormat } from '../../modules/organization-profile/domain/organization-logo';
import { DEMO_DATASET, DEMO_SEED_PASSWORD } from './demo-dataset';
import { DEV_DATASET } from './dev-dataset';

// demo-seed-data: the content the user approved (draft v1, 2026-11-27).
// Every literal must survive the shared request schemas unchanged, like the
// dev dataset (dev-seed-data design.md Decision 10).
const data = DEMO_DATASET;
const SIGNER_ROLES = ['MAINTENANCE_TECHNICIAN', 'COMMUNITY_REPRESENTATIVE'];
const roleOf = (email: string) =>
  data.users.find((u) => u.email === email)!.role;

describe('DEMO_DATASET', () => {
  it('uses a password accepted by the shared password policy', () => {
    expect(data.password).toBe(DEMO_SEED_PASSWORD);
    expect(passwordSchema.safeParse(DEMO_SEED_PASSWORD).success).toBe(true);
  });

  it('fills every organization profile field and is canonical', () => {
    expect(Object.keys(data.profile).sort()).toEqual(
      ['address', 'email', 'legalName', 'name', 'phone', 'taxId'].sort(),
    );
    expect(updateOrganizationProfileSchema.parse(data.profile)).toEqual(
      data.profile,
    );
  });

  it('has an SVG logo the logo upload accepts', () => {
    expect(detectLogoFormat(Buffer.from(data.logoSvg, 'utf8'))).toEqual(
      expect.objectContaining({ contentType: 'image/svg+xml' }),
    );
  });

  it('has three companies: one with two technicians, two with one', () => {
    expect(data.companies).toHaveLength(3);
    const technicians = data.companies.map(
      (c) =>
        data.users.filter(
          (u) =>
            u.role === 'MAINTENANCE_TECHNICIAN' && u.companyTaxId === c.taxId,
        ).length,
    );
    expect(technicians).toEqual([2, 1, 1]);
    for (const company of data.companies) {
      expect(createMaintenanceCompanySchema.parse(company)).toEqual(company);
    }
  });

  it('never reuses a dev dataset email or tax id', () => {
    const devEmails = new Set(DEV_DATASET.users.map((u) => u.email));
    const devTaxIds = new Set(DEV_DATASET.companies.map((c) => c.taxId));
    expect(data.users.filter((u) => devEmails.has(u.email))).toEqual([]);
    expect(data.companies.filter((c) => devTaxIds.has(c.taxId))).toEqual([]);
    for (const user of data.users) {
      expect(user.email).toMatch(/^[a-z0-9]+@demo\.sf-manager\.example$/);
    }
  });

  it('has no system admin: its credentials are never public', () => {
    expect(data.users.map((u) => u.role)).not.toContain('SYSTEM_ADMIN');
  });

  it('has six canonical communities with three to five extinguishers each', () => {
    expect(data.communities).toHaveLength(6);
    for (const community of data.communities) {
      expect(createCommunitySchema.parse(community)).toEqual(community);
      const count = data.elements.filter(
        (e) => e.communityName === community.name,
      ).length;
      expect(count).toBeGreaterThanOrEqual(3);
      expect(count).toBeLessThanOrEqual(5);
    }
  });

  it('gives every element a canonical shape and a valid fixed code', () => {
    for (const { communityName, code, ...element } of data.elements) {
      expect(data.communities.map((c) => c.name)).toContain(communityName);
      expect(element.elementType).toBe('EXTINGUISHER');
      expect(createInspectableElementSchema.parse(element)).toEqual(element);
      expect(elementCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  // S8: the printed QR document depends on these exact codes. Changing one
  // is a deliberate act that also reprints that label.
  it('keeps the fixed QR codes', () => {
    expect(data.elements.map((e) => e.code)).toEqual([
      'DEMMAEXT22',
      'DEMMAEXT23',
      'DEMMAEXT24',
      'DEMJAEXT22',
      'DEMJAEXT23',
      'DEMJAEXT24',
      'DEMJAEXT25',
      'DEMJAEXT26',
      'DEMSEEXT22',
      'DEMSEEXT23',
      'DEMSEEXT24',
      'DEMSEEXT25',
      'DEMPREXT22',
      'DEMPREXT23',
      'DEMPREXT24',
      'DEMPREXT25',
      'DEMVDEXT22',
      'DEMVDEXT23',
      'DEMVDEXT24',
      'DEMVDEXT25',
      'DEMVDEXT26',
      'DEMTREXT22',
      'DEMTREXT23',
      'DEMTREXT24',
    ]);
  });

  it('has fifteen quarterly questions also asked yearly, and five yearly-only ones, all canonical', () => {
    const both = data.questions.filter(
      (q) =>
        q.frequencies.length === 2 &&
        q.frequencies.includes('QUARTERLY') &&
        q.frequencies.includes('ANNUAL'),
    );
    const annualOnly = data.questions.filter(
      (q) => q.frequencies.length === 1 && q.frequencies[0] === 'ANNUAL',
    );
    expect(both).toHaveLength(15);
    expect(annualOnly).toHaveLength(5);
    expect(data.questions).toHaveLength(20);
    expect(new Set(data.questions.map((q) => q.text)).size).toBe(20);
    for (const question of data.questions) {
      expect(question.elementType).toBe('EXTINGUISHER');
      expect(createChecklistQuestionSchema.parse(question)).toEqual(question);
    }
  });

  it('has one extinguisher template per seeded frequency', () => {
    expect(
      data.templates.map((t) => [t.elementType, t.frequency]).sort(),
    ).toEqual([
      ['EXTINGUISHER', 'ANNUAL'],
      ['EXTINGUISHER', 'QUARTERLY'],
    ]);
  });

  it('gives each signer a signature variant of their own', () => {
    const signers = data.users.filter((u) => SIGNER_ROLES.includes(u.role));
    expect(signers).toHaveLength(7);
    const variants = signers.map((u) => u.signatureVariant);
    expect(variants.every((v) => v !== undefined)).toBe(true);
    expect(new Set(variants).size).toBe(signers.length);
  });

  it('has one to three sessions per community', () => {
    for (const community of data.communities) {
      const count = data.sessions.filter(
        (s) => s.communityName === community.name,
      ).length;
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it('has every annual session performed by a technician', () => {
    const annual = data.sessions.filter((s) => s.frequency === 'ANNUAL');
    expect(annual.length).toBeGreaterThan(0);
    for (const session of annual) {
      expect(roleOf(session.performerEmail)).toBe('MAINTENANCE_TECHNICIAN');
    }
  });

  it('has at least five quarterly sessions performed by representatives', () => {
    const byRepresentatives = data.sessions.filter(
      (s) =>
        s.frequency === 'QUARTERLY' &&
        roleOf(s.performerEmail) === 'COMMUNITY_REPRESENTATIVE',
    );
    expect(byRepresentatives.length).toBeGreaterThanOrEqual(5);
  });

  it('has each session performed by someone assigned to its community in their role', () => {
    for (const session of data.sessions) {
      const as =
        roleOf(session.performerEmail) === 'COMMUNITY_REPRESENTATIVE'
          ? 'REPRESENTATIVE'
          : 'TECHNICIAN';
      expect(data.assignments).toContainEqual({
        communityName: session.communityName,
        userEmail: session.performerEmail,
        as,
      });
    }
  });

  it('has each community represented by exactly one representative', () => {
    for (const community of data.communities) {
      expect(
        data.assignments.filter(
          (a) =>
            a.communityName === community.name && a.as === 'REPRESENTATIVE',
        ),
      ).toHaveLength(1);
    }
  });

  it('dates every completed session in the past and leaves drafts undated', () => {
    for (const session of data.sessions) {
      if (session.complete) {
        expect(session.daysAgo).toBeGreaterThanOrEqual(1);
      } else {
        expect(session.daysAgo).toBeUndefined();
      }
    }
  });

  it('only records entries for elements of the session community, and NO only on questions its template asks', () => {
    for (const session of data.sessions) {
      const names = data.elements
        .filter((e) => e.communityName === session.communityName)
        .map((e) => e.name);
      for (const entry of session.entries) {
        expect(names).toContain(entry.elementName);
        if (entry.noOn !== undefined) {
          expect(entry.outcome).toBe('NO');
          const question = data.questions.find((q) => q.text === entry.noOn);
          expect(question?.frequencies).toContain(session.frequency);
        }
      }
    }
  });

  it('never repeats a performer, community and frequency (one session each)', () => {
    const keys = data.sessions.map(
      (s) => `${s.performerEmail}|${s.communityName}|${s.frequency}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
