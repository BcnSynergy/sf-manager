import {
  createChecklistQuestionSchema,
  createCommunitySchema,
  createInspectableElementSchema,
  createMaintenanceCompanySchema,
  createUserSchema,
  passwordSchema,
  updateOrganizationProfileSchema,
} from '@sf-manager/validation';
import { DEV_DATASET, DEV_SEED_MARKER, DEV_SEED_PASSWORD } from './dev-dataset';

// dev-seed-data design.md Decision 10: use cases trust input the HTTP pipe
// already canonicalized, so every dataset literal must survive the shared
// request schemas UNCHANGED. Without this check a lower-case tax id would
// silently defeat the natural-key skip (Decision 4).
describe('DEV_DATASET', () => {
  it('uses a password accepted by the shared password policy', () => {
    expect(passwordSchema.safeParse(DEV_SEED_PASSWORD).success).toBe(true);
  });

  it('seeds two companies', () => {
    expect(DEV_DATASET.companies.map((c) => c.name)).toEqual([
      'Dev Seed Fire Safety A',
      'Dev Seed Fire Safety B',
    ]);
  });

  it.each(DEV_DATASET.companies.map((company) => [company.name, company]))(
    'company %s is canonical through createMaintenanceCompanySchema',
    (_name, company) => {
      expect(createMaintenanceCompanySchema.parse(company)).toEqual(company);
    },
  );

  it('seeds the six non-admin users of the design table', () => {
    expect(DEV_DATASET.users.map((u) => [u.email, u.role])).toEqual([
      ['technician@sf-manager.example', 'MAINTENANCE_TECHNICIAN'],
      ['technician2@sf-manager.example', 'MAINTENANCE_TECHNICIAN'],
      ['companymgr@sf-manager.example', 'MAINTENANCE_COMPANY_MANAGER'],
      ['rep@sf-manager.example', 'COMMUNITY_REPRESENTATIVE'],
      ['manager@sf-manager.example', 'MANAGER'],
      ['manager-nocap@sf-manager.example', 'MANAGER'],
    ]);
  });

  it('grants VIEW_ALL_REVIEWS to exactly one of the two managers', () => {
    const managers = DEV_DATASET.users.filter((u) => u.role === 'MANAGER');

    expect(managers).toHaveLength(2);
    expect(
      managers
        .filter((m) => m.managerCapabilities?.includes('VIEW_ALL_REVIEWS'))
        .map((m) => m.email),
    ).toEqual(['manager@sf-manager.example']);
  });

  it('assigns every maintenance-side user to a seeded company by tax id', () => {
    const taxIds = DEV_DATASET.companies.map((c) => c.taxId);
    const maintenance = DEV_DATASET.users.filter(
      (u) =>
        u.role === 'MAINTENANCE_TECHNICIAN' ||
        u.role === 'MAINTENANCE_COMPANY_MANAGER',
    );

    expect(maintenance).toHaveLength(3);
    for (const user of maintenance) {
      expect(taxIds).toContain(user.companyTaxId);
    }
    // technician2@ belongs to the other company (scope asymmetry).
    expect(new Set(maintenance.map((u) => u.companyTaxId)).size).toBe(2);
  });

  it.each(DEV_DATASET.users.map((user) => [user.email, user]))(
    'user %s is canonical through createUserSchema',
    (_email, user) => {
      const input = {
        email: user.email,
        password: DEV_DATASET.password,
        role: user.role,
        ...(user.companyTaxId !== undefined && {
          maintenanceCompanyId: 'company-id-placeholder',
        }),
      };

      expect(createUserSchema.parse(input)).toEqual(input);
    },
  );

  it('seeds two communities, four elements and three questions', () => {
    expect(DEV_DATASET.communities).toHaveLength(2);
    expect(DEV_DATASET.elements).toHaveLength(4);
    expect(DEV_DATASET.questions).toHaveLength(3);
  });

  it.each(
    DEV_DATASET.communities.map((community) => [community.name, community]),
  )(
    'community %s is canonical through createCommunitySchema',
    (_name, community) => {
      expect(createCommunitySchema.parse(community)).toEqual(community);
    },
  );

  it.each(DEV_DATASET.elements.map((element) => [element.name, element]))(
    'element %s is canonical through createInspectableElementSchema',
    (_name, element) => {
      const { communityName, ...request } = element;
      expect(communityName).toBeTruthy();
      expect(createInspectableElementSchema.parse(request)).toEqual(request);
    },
  );

  it.each(DEV_DATASET.questions.map((question) => [question.text, question]))(
    'question %s is canonical through createChecklistQuestionSchema',
    (_text, question) => {
      expect(createChecklistQuestionSchema.parse(question)).toEqual(question);
    },
  );

  it('profile is canonical through updateOrganizationProfileSchema and fully filled', () => {
    expect(updateOrganizationProfileSchema.parse(DEV_DATASET.profile)).toEqual(
      DEV_DATASET.profile,
    );
    expect(Object.keys(DEV_DATASET.profile).sort()).toEqual([
      'address',
      'email',
      'legalName',
      'name',
      'phone',
      'taxId',
    ]);
  });

  it('carries the Dev Seed marker on every seeded name so the rows are recognizable', () => {
    const names = [
      ...DEV_DATASET.communities.map((c) => c.name),
      ...DEV_DATASET.elements.map((e) => e.name),
      ...DEV_DATASET.templates.map((t) => t.name),
    ];

    for (const name of names) {
      expect(name).toContain(DEV_SEED_MARKER);
    }
  });

  it('resolves every assignment and element to a seeded community and user', () => {
    const communities = DEV_DATASET.communities.map((c) => c.name);
    const emails = DEV_DATASET.users.map((u) => u.email);

    for (const assignment of DEV_DATASET.assignments) {
      expect(communities).toContain(assignment.communityName);
      expect(emails).toContain(assignment.userEmail);
    }
    for (const element of DEV_DATASET.elements) {
      expect(communities).toContain(element.communityName);
    }
  });

  it('makes the assignments asymmetric across the two communities', () => {
    const summary = DEV_DATASET.assignments.map(
      (a) => `${a.as}:${a.userEmail}:${a.communityName}`,
    );

    expect(summary.sort()).toEqual(
      [
        'REPRESENTATIVE:rep@sf-manager.example:Dev Seed Residences North',
        'TECHNICIAN:technician@sf-manager.example:Dev Seed Residences North',
        'TECHNICIAN:technician@sf-manager.example:Dev Seed Residences South',
        'TECHNICIAN:technician2@sf-manager.example:Dev Seed Residences South',
      ].sort(),
    );
  });

  it('seeds one EXTINGUISHER template per frequency, QUARTERLY and ANNUAL, never MONTHLY', () => {
    expect(
      DEV_DATASET.templates.map((t) => [t.elementType, t.frequency]),
    ).toEqual([
      ['EXTINGUISHER', 'QUARTERLY'],
      ['EXTINGUISHER', 'ANNUAL'],
    ]);
    expect(DEV_DATASET.templates.map((t) => t.name)).toEqual([
      'Dev Seed Extinguisher Quarterly Check',
      'Dev Seed Extinguisher Annual Check',
    ]);
    expect(JSON.stringify(DEV_DATASET)).not.toContain('MONTHLY');
  });

  it('tags every question for both seeded frequencies', () => {
    expect(DEV_DATASET.questions).toHaveLength(3);
    for (const question of DEV_DATASET.questions) {
      expect(question.elementType).toBe('EXTINGUISHER');
      expect(question.frequencies).toEqual(['QUARTERLY', 'ANNUAL']);
    }
  });

  describe('sessions', () => {
    const sessions = DEV_DATASET.sessions;

    it('plans four completed sessions and one partial draft', () => {
      expect(
        sessions.map(
          (s) =>
            `${s.performerEmail}|${s.communityName}|${s.frequency}|${s.complete}`,
        ),
      ).toEqual([
        'technician@sf-manager.example|Dev Seed Residences North|QUARTERLY|true',
        'technician@sf-manager.example|Dev Seed Residences South|QUARTERLY|true',
        'technician2@sf-manager.example|Dev Seed Residences South|QUARTERLY|true',
        'technician@sf-manager.example|Dev Seed Residences North|ANNUAL|true',
        'rep@sf-manager.example|Dev Seed Residences North|QUARTERLY|false',
      ]);
      const draft = sessions.find((s) => !s.complete)!;
      const inCommunity = DEV_DATASET.elements.filter(
        (e) => e.communityName === draft.communityName,
      );
      expect(draft.entries).toHaveLength(1);
      expect(inCommunity).toHaveLength(2);
    });

    it('plans the only ANNUAL session in North and a QUARTERLY one in each community', () => {
      const completed = sessions.filter((s) => s.complete);

      expect(
        completed
          .filter((s) => s.frequency === 'ANNUAL')
          .map((s) => s.communityName),
      ).toEqual(['Dev Seed Residences North']);
      for (const community of DEV_DATASET.communities) {
        expect(
          completed.some(
            (s) =>
              s.frequency === 'QUARTERLY' && s.communityName === community.name,
          ),
        ).toBe(true);
      }
    });

    it('binds every session to a seeded template of its own frequency', () => {
      for (const session of sessions) {
        expect(DEV_DATASET.templates.map((t) => t.frequency)).toContain(
          session.frequency,
        );
      }
    });

    it('never plans two sessions for the same performer, community and frequency', () => {
      const keys = sessions.map(
        (s) => `${s.performerEmail}|${s.communityName}|${s.frequency}`,
      );

      expect(new Set(keys).size).toBe(keys.length);
    });

    it('performs each session as a user assigned to its community, on its elements', () => {
      for (const session of sessions) {
        expect(DEV_DATASET.assignments).toContainEqual(
          expect.objectContaining({
            userEmail: session.performerEmail,
            communityName: session.communityName,
          }),
        );
        expect(session.entries.length).toBeGreaterThan(0);
        for (const entry of session.entries) {
          expect(DEV_DATASET.elements).toContainEqual(
            expect.objectContaining({
              communityName: session.communityName,
              name: entry.elementName,
            }),
          );
        }
      }
    });

    it('gives the technician South session one NO answer and one unreviewed element', () => {
      const south = sessions[1];

      expect(south.entries.map((e) => e.outcome).sort()).toEqual([
        'NO',
        'UNREVIEWED',
      ]);
    });
  });
});
