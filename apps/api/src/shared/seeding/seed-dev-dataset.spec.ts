// In-memory fakes implement async ports without awaiting anything.
/* eslint-disable @typescript-eslint/require-await */
import { EmailAlreadyInUseError } from '../../modules/users/domain/errors/email-already-in-use.error';
import type { ManagerCapability } from '../../modules/users/domain/manager-capability';
import { User } from '../../modules/users/domain/user.entity';
import { MaintenanceCompany } from '../../modules/maintenance-company/domain/maintenance-company.entity';
import { ReviewTemplate } from '../../modules/review-template/domain/review-template.entity';
import { DEV_DATASET } from './dev-dataset';
import {
  runDevSeed,
  seedDevDataset,
  type DevSeedDeps,
} from './seed-dev-dataset';

const NOW = new Date('2026-01-01T00:00:00Z');
const TECHNICIAN = 'technician@sf-manager.example';
const MANAGER = 'manager@sf-manager.example';

type Input<K extends keyof DevSeedDeps> = DevSeedDeps[K] extends {
  execute(input: infer I): unknown;
}
  ? I
  : never;

interface World {
  companies: MaintenanceCompany[];
  users: User[];
  communities: { id: string; name: string }[];
  // 'communityId|userId' keys, whatever the assignment state.
  assignments: Set<string>;
  elements: { communityId: string; name: string }[];
  questions: { id: string; elementType: string; text: string }[];
  templates: ReviewTemplate[];
  // Frozen snapshot size per template id; defaults to 3.
  snapshotSizes: Map<string, number>;
  profileUpdates: Input<'updateProfile'>[];
  addedRepresentatives: Input<'addRepresentative'>[];
  addedTechnicians: Input<'addTechnician'>[];
  createdElements: Input<'createElement'>[];
  createdDrafts: Input<'createDraftTemplate'>[];
  templateQuestionSets: Input<'setTemplateQuestions'>[];
  activated: string[];
  createdCompanies: Parameters<DevSeedDeps['createCompany']['execute']>[0][];
  createdUsers: Parameters<DevSeedDeps['createUser']['execute']>[0][];
  updates: Parameters<DevSeedDeps['updateUser']['execute']>[0][];
  // Emails whose create call throws the given error.
  createUserFails: Map<string, Error>;
  deps: DevSeedDeps;
}

// In-memory fake of the seed's ports and use cases. `create*` mutate the
// same lists the lookups read, like the real adapters do.
function buildWorld(
  seed: {
    companies?: MaintenanceCompany[];
    users?: User[];
    communities?: World['communities'];
    assignments?: string[];
    elements?: World['elements'];
    questions?: World['questions'];
    templates?: ReviewTemplate[];
  } = {},
): World {
  const world = {
    companies: [...(seed.companies ?? [])],
    users: [...(seed.users ?? [])],
    communities: [...(seed.communities ?? [])],
    assignments: new Set(seed.assignments ?? []),
    elements: [...(seed.elements ?? [])],
    questions: [...(seed.questions ?? [])],
    templates: [...(seed.templates ?? [])],
    snapshotSizes: new Map<string, number>(),
    profileUpdates: [],
    addedRepresentatives: [],
    addedTechnicians: [],
    createdElements: [],
    createdDrafts: [],
    templateQuestionSets: [],
    activated: [],
    createdCompanies: [],
    createdUsers: [],
    updates: [],
    createUserFails: new Map<string, Error>(),
  } as unknown as World;

  world.deps = {
    companyRepository: { findAll: async () => [...world.companies] },
    userRepository: {
      findByEmail: async (email) =>
        world.users.find((u) => u.email === email) ?? null,
    },
    createCompany: {
      execute: async (input) => {
        world.createdCompanies.push(input);
        const id = `company-${world.companies.length + 1}`;
        world.companies.push(
          new MaintenanceCompany({ id, ...input, deletedAt: null }),
        );
        return { id };
      },
    },
    createUser: {
      execute: async (input) => {
        world.createdUsers.push(input);
        const failure = world.createUserFails.get(input.email);
        if (failure) {
          throw failure;
        }
        const id = `user-${world.users.length + 1}`;
        world.users.push(
          new User({
            id,
            email: input.email,
            passwordHash: 'hash',
            role: input.role,
            createdAt: NOW,
            updatedAt: NOW,
            deletedAt: null,
            maintenanceCompanyId: input.maintenanceCompanyId ?? null,
          }),
        );
        return { id, managerCapabilities: [] };
      },
    },
    updateUser: {
      execute: async (input) => {
        world.updates.push(input);
        return {};
      },
    },
    updateProfile: {
      execute: async (changes) => {
        world.profileUpdates.push(changes);
      },
    },
    communityRepository: {
      findAll: async () => [...world.communities] as never,
    },
    createCommunity: {
      execute: async (input) => {
        const id = `community-${world.communities.length + 1}`;
        world.communities.push({ id, name: input.name });
        return { id };
      },
    },
    representativeRepository: {
      findByCommunityAndUser: async (communityId, userId) =>
        world.assignments.has(`${communityId}|${userId}`)
          ? ({} as never)
          : null,
    },
    technicianRepository: {
      findByCommunityAndUser: async (communityId, userId) =>
        world.assignments.has(`${communityId}|${userId}`)
          ? ({} as never)
          : null,
    },
    addRepresentative: {
      execute: async (input) => {
        world.addedRepresentatives.push(input);
      },
    },
    addTechnician: {
      execute: async (input) => {
        world.addedTechnicians.push(input);
      },
    },
    elementRepository: {
      findAllByCommunity: async (communityId) =>
        world.elements.filter((e) => e.communityId === communityId) as never,
    },
    createElement: {
      execute: async (input) => {
        world.createdElements.push(input);
      },
    },
    questionRepository: { findAll: async () => [...world.questions] as never },
    createQuestion: {
      execute: async (input) => {
        const id = `question-${world.questions.length + 1}`;
        world.questions.push({ id, ...input });
        return { id };
      },
    },
    templateRepository: {
      findAll: async () => [...world.templates],
      findFrozenWithSnapshot: async (id) =>
        ({
          id,
          questions: Array.from({ length: world.snapshotSizes.get(id) ?? 3 }),
        }) as never,
    },
    createDraftTemplate: {
      execute: async (input) => {
        world.createdDrafts.push(input);
        return { id: 'draft-new' };
      },
    },
    setTemplateQuestions: {
      execute: async (input) => {
        world.templateQuestionSets.push(input);
      },
    },
    activateTemplate: {
      execute: async (id) => {
        world.activated.push(id);
        return {};
      },
    },
  };
  return world;
}

function existingCompanies(): MaintenanceCompany[] {
  return DEV_DATASET.companies.map(
    (c, i) =>
      new MaintenanceCompany({ id: `c${i + 1}`, ...c, deletedAt: null }),
  );
}

function existingUser(
  email: string,
  overrides: {
    role?: User['role'];
    maintenanceCompanyId?: string | null;
    managerCapabilities?: ManagerCapability[];
  } = {},
): User {
  const dev = DEV_DATASET.users.find((u) => u.email === email)!;
  const companyIndex = DEV_DATASET.companies.findIndex(
    (c) => c.taxId === dev.companyTaxId,
  );
  const companyId = companyIndex === -1 ? null : `c${companyIndex + 1}`;
  return new User({
    id: `existing-${email}`,
    email,
    passwordHash: 'hash',
    role: overrides.role ?? dev.role,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    maintenanceCompanyId:
      overrides.maintenanceCompanyId !== undefined
        ? overrides.maintenanceCompanyId
        : companyId,
    managerCapabilities: overrides.managerCapabilities ?? [],
  });
}

function fullyExistingWorld(): World {
  return buildWorld({
    companies: existingCompanies(),
    users: DEV_DATASET.users.map((u) =>
      existingUser(u.email, {
        managerCapabilities: u.managerCapabilities ?? [],
      }),
    ),
  });
}

describe('seedDevDataset', () => {
  it('creates both companies and all six users on an empty database', async () => {
    const world = buildWorld();

    await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

    expect(world.createdCompanies).toEqual(DEV_DATASET.companies);
    expect(world.createdUsers.map((u) => u.email)).toEqual(
      DEV_DATASET.users.map((u) => u.email),
    );
    for (const created of world.createdUsers) {
      expect(created.password).toBe(DEV_DATASET.password);
    }
  });

  it('resolves each maintenance user to the id of its seeded company', async () => {
    const world = buildWorld();

    await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

    const idByTaxId = new Map(world.companies.map((c) => [c.taxId, c.id]));
    const byEmail = (email: string) =>
      world.createdUsers.find((u) => u.email === email)!;
    expect(byEmail(TECHNICIAN).maintenanceCompanyId).toBe(
      idByTaxId.get('B99000001'),
    );
    expect(byEmail('technician2@sf-manager.example').maintenanceCompanyId).toBe(
      idByTaxId.get('B99000002'),
    );
    expect(
      byEmail('rep@sf-manager.example').maintenanceCompanyId,
    ).toBeUndefined();
  });

  it('skips companies and users that already exist and creates nothing', async () => {
    const world = fullyExistingWorld();
    const log = jest.fn();

    await seedDevDataset(world.deps, DEV_DATASET, log);

    expect(world.createdCompanies).toEqual([]);
    expect(world.createdUsers).toEqual([]);
    expect(world.updates).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(`User ${TECHNICIAN} already exists`),
    );
  });

  it('creates only what is missing (partial data completed)', async () => {
    const world = buildWorld({
      companies: existingCompanies().slice(0, 1),
      users: [existingUser(TECHNICIAN)],
    });

    await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

    expect(world.createdCompanies.map((c) => c.taxId)).toEqual(['B99000002']);
    expect(world.createdUsers.map((u) => u.email)).not.toContain(TECHNICIAN);
    expect(world.createdUsers).toHaveLength(DEV_DATASET.users.length - 1);
  });

  describe('drift', () => {
    it('blocks a drifted user: warns, does not create or grant, continues', async () => {
      const world = buildWorld({
        companies: existingCompanies(),
        // The legacy dev technician: right email, no company.
        users: [existingUser(TECHNICIAN, { maintenanceCompanyId: null })],
      });
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(
            `WARN.*${TECHNICIAN}.*company is none.*migrate reset.*db seed`,
          ),
        ),
      );
      expect(world.createdUsers.map((u) => u.email)).not.toContain(TECHNICIAN);
      // The rest of the dataset still ran.
      expect(world.createdUsers).toHaveLength(DEV_DATASET.users.length - 1);
      // The drifted row is not repaired; only the created manager is granted.
      expect(world.updates.map((u) => u.id)).not.toContain(
        `existing-${TECHNICIAN}`,
      );
      expect(world.updates).toHaveLength(1);
    });

    it('does not grant a capability to a drifted user', async () => {
      const world = buildWorld({
        companies: existingCompanies(),
        users: [existingUser(MANAGER, { role: 'COMMUNITY_REPRESENTATIVE' })],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.updates).toEqual([]);
    });
  });

  describe('soft-deleted email', () => {
    it('warns, blocks that user and keeps seeding the rest', async () => {
      const world = buildWorld();
      world.createUserFails.set(TECHNICIAN, new EmailAlreadyInUseError());
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`WARN.*${TECHNICIAN}.*migrate reset.*db seed`),
        ),
      );
      // The other five users were still created.
      expect(world.users).toHaveLength(DEV_DATASET.users.length - 1);
    });

    it('propagates any other error from user creation', async () => {
      const world = buildWorld();
      world.createUserFails.set(TECHNICIAN, new Error('database is down'));

      await expect(
        seedDevDataset(world.deps, DEV_DATASET, jest.fn()),
      ).rejects.toThrow('database is down');
    });
  });

  describe('VIEW_ALL_REVIEWS grant', () => {
    it('grants the capability to a freshly created manager', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      const created = world.users.find((u) => u.email === MANAGER)!;
      expect(world.updates).toEqual([
        { id: created.id, managerCapabilities: ['VIEW_ALL_REVIEWS'] },
      ]);
    });

    it('grants it to an existing manager that lacks it', async () => {
      const world = fullyExistingWorld();
      world.users = world.users.map((u) =>
        u.email === MANAGER ? existingUser(MANAGER) : u,
      );

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.updates).toEqual([
        {
          id: `existing-${MANAGER}`,
          managerCapabilities: ['VIEW_ALL_REVIEWS'],
        },
      ]);
    });

    it('does not update a manager that already holds it', async () => {
      const world = fullyExistingWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.updates).toEqual([]);
    });

    it('never grants a capability to the manager without one', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      const noCap = world.users.find(
        (u) => u.email === 'manager-nocap@sf-manager.example',
      )!;
      expect(world.updates.map((u) => u.id)).not.toContain(noCap.id);
    });
  });
});

const NORTH = 'Dev Seed Residences North';
const SOUTH = 'Dev Seed Residences South';
const REP = 'rep@sf-manager.example';
const TECHNICIAN_2 = 'technician2@sf-manager.example';

function template(
  status: 'draft' | 'active',
  name: string,
  id: string,
): ReviewTemplate {
  return new ReviewTemplate({
    id,
    elementType: 'EXTINGUISHER',
    frequency: 'MONTHLY',
    name,
    version: status === 'draft' ? null : 1,
    status,
    draftQuestionIds: [],
    createdAt: NOW,
    deletedAt: null,
  });
}

describe('seedDevDataset catalog', () => {
  const idOf = (world: World, name: string) =>
    world.communities.find((c) => c.name === name)!.id;
  const userId = (world: World, email: string) =>
    world.users.find((u) => u.email === email)!.id;

  it('overwrites the organization profile on every run', async () => {
    const world = fullyExistingWorld();

    await seedDevDataset(world.deps, DEV_DATASET, jest.fn());
    await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

    expect(world.profileUpdates).toEqual([
      DEV_DATASET.profile,
      DEV_DATASET.profile,
    ]);
  });

  describe('communities', () => {
    it('creates both communities on an empty database', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.communities.map((c) => c.name)).toEqual([NORTH, SOUTH]);
    });

    it('skips a community that already exists by name', async () => {
      const world = buildWorld({
        communities: [{ id: 'c-north', name: NORTH }],
      });
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(world.communities.map((c) => c.name)).toEqual([NORTH, SOUTH]);
      expect(log).toHaveBeenCalledWith(
        `Community ${NORTH} already exists, skipping.`,
      );
    });
  });

  describe('assignments', () => {
    it('assigns the representative and technicians by resolved ids', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.addedRepresentatives).toEqual([
        {
          communityId: idOf(world, NORTH),
          userId: userId(world, REP),
        },
      ]);
      expect(world.addedTechnicians).toEqual([
        {
          communityId: idOf(world, NORTH),
          userId: userId(world, TECHNICIAN),
        },
        {
          communityId: idOf(world, SOUTH),
          userId: userId(world, TECHNICIAN),
        },
        {
          communityId: idOf(world, SOUTH),
          userId: userId(world, TECHNICIAN_2),
        },
      ]);
    });

    it('never re-adds an existing assignment, whatever its state', async () => {
      const world = fullyExistingWorld();
      world.communities = [
        { id: 'c-north', name: NORTH },
        { id: 'c-south', name: SOUTH },
      ];
      world.assignments = new Set([
        `c-north|existing-${REP}`,
        `c-north|existing-${TECHNICIAN}`,
      ]);

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.addedRepresentatives).toEqual([]);
      expect(world.addedTechnicians).toEqual([
        { communityId: 'c-south', userId: `existing-${TECHNICIAN}` },
        { communityId: 'c-south', userId: `existing-${TECHNICIAN_2}` },
      ]);
    });

    it('skips every assignment of a drifted user and logs it', async () => {
      const world = buildWorld({
        companies: existingCompanies(),
        users: [existingUser(TECHNICIAN, { maintenanceCompanyId: null })],
      });
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(world.addedTechnicians.map((a) => a.userId)).toEqual([
        userId(world, TECHNICIAN_2),
      ]);
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`WARN.*${TECHNICIAN}.*assignment.*skipp`),
        ),
      );
      // The rest of the catalog still ran.
      expect(world.addedRepresentatives).toHaveLength(1);
      expect(world.activated).toHaveLength(1);
    });

    it('skips every assignment of a user whose email is held by a soft-deleted row', async () => {
      const world = buildWorld();
      world.createUserFails.set(REP, new EmailAlreadyInUseError());

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.addedRepresentatives).toEqual([]);
      expect(world.addedTechnicians).toHaveLength(3);
    });
  });

  describe('elements', () => {
    it('creates every element under its community, resolved by name', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(
        world.createdElements.map((e) => [e.communityId, e.name]).sort(),
      ).toEqual(
        DEV_DATASET.elements
          .map((e) => [idOf(world, e.communityName), e.name])
          .sort(),
      );
      expect(world.createdElements[0]).toMatchObject({
        elementType: 'EXTINGUISHER',
        installedAt: '2024-01-15',
      });
    });

    it('skips an element that already exists in its community', async () => {
      const first = DEV_DATASET.elements.find(
        (e) => e.communityName === NORTH,
      )!;
      const world = buildWorld({
        communities: [{ id: 'c-north', name: NORTH }],
        elements: [{ communityId: 'c-north', name: first.name }],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.createdElements.map((e) => e.name)).not.toContain(
        first.name,
      );
      expect(world.createdElements).toHaveLength(
        DEV_DATASET.elements.length - 1,
      );
    });
  });

  describe('questions', () => {
    it('creates every question once', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.questions.map((q) => q.text)).toEqual(
        DEV_DATASET.questions.map((q) => q.text),
      );
    });

    it('skips a question that already exists by element type and text', async () => {
      const world = buildWorld({
        questions: [
          {
            id: 'q-existing',
            elementType: 'EXTINGUISHER',
            text: DEV_DATASET.questions[0].text,
          },
        ],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.questions).toHaveLength(DEV_DATASET.questions.length);
    });
  });

  describe('template', () => {
    it('creates a draft, sets the seeded questions in order and activates it', async () => {
      const world = buildWorld();

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.createdDrafts).toEqual([DEV_DATASET.template]);
      expect(world.templateQuestionSets).toEqual([
        {
          templateId: 'draft-new',
          questionIds: world.questions.map((q) => q.id),
        },
      ]);
      expect(world.activated).toEqual(['draft-new']);
    });

    it('resolves the seeded question ids even when a question already existed', async () => {
      const world = buildWorld({
        questions: [
          {
            id: 'q-existing',
            elementType: 'EXTINGUISHER',
            text: DEV_DATASET.questions[1].text,
          },
        ],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      const [{ questionIds }] = world.templateQuestionSets;
      expect(questionIds).toHaveLength(DEV_DATASET.questions.length);
      expect(questionIds[1]).toBe('q-existing');
    });

    it('finishes a seeded draft without creating another', async () => {
      const world = buildWorld({
        templates: [template('draft', DEV_DATASET.template.name, 'draft-seed')],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.createdDrafts).toEqual([]);
      expect(world.templateQuestionSets.map((s) => s.templateId)).toEqual([
        'draft-seed',
      ]);
      expect(world.activated).toEqual(['draft-seed']);
    });

    it('uses a usable active template and writes nothing', async () => {
      const world = buildWorld({
        templates: [template('active', 'Other name', 'active-1')],
      });

      await seedDevDataset(world.deps, DEV_DATASET, jest.fn());

      expect(world.createdDrafts).toEqual([]);
      expect(world.templateQuestionSets).toEqual([]);
      expect(world.activated).toEqual([]);
    });

    it('leaves a foreign draft untouched and warns', async () => {
      const world = buildWorld({
        templates: [template('draft', 'Not a seed name', 'draft-foreign')],
      });
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(world.createdDrafts).toEqual([]);
      expect(world.templateQuestionSets).toEqual([]);
      expect(world.activated).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*draft-foreign.*not a seed draft/),
      );
    });

    it('leaves an active template without questions untouched and warns', async () => {
      const world = buildWorld({
        templates: [template('active', 'Empty one', 'active-empty')],
      });
      world.snapshotSizes.set('active-empty', 0);
      const log = jest.fn();

      await seedDevDataset(world.deps, DEV_DATASET, log);

      expect(world.createdDrafts).toEqual([]);
      expect(world.activated).toEqual([]);
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/WARN.*active-empty.*no questions/),
      );
    });
  });
});

describe('runDevSeed', () => {
  // Deps that fail loudly on any use: proves a closed gate touches nothing.
  const throwingDeps = new Proxy({} as DevSeedDeps, {
    get() {
      throw new Error('deps must not be touched when the gate is closed');
    },
  });

  it.each([
    ['production', 'NODE_ENV is "production"'],
    ['test', 'NODE_ENV is "test"'],
    [undefined, 'NODE_ENV is unset'],
  ])(
    'with NODE_ENV=%s calls no use case and logs the skip with the host',
    async (nodeEnv, expectedFragment) => {
      const log = jest.fn();

      const outcome = await runDevSeed(
        nodeEnv,
        'db.example:5432',
        throwingDeps,
        DEV_DATASET,
        log,
      );

      expect(outcome).toBe('skipped');
      expect(log).toHaveBeenCalledTimes(1);
      const [[line]] = log.mock.calls as [[string]];
      expect(line).toContain('Skipping dev seed data');
      expect(line).toContain(expectedFragment);
      expect(line).toContain('NODE_ENV=development');
      expect(line).toContain('Target database host: db.example:5432');
    },
  );

  it('with NODE_ENV=development logs the start line with the host and seeds', async () => {
    const world = buildWorld();
    const log = jest.fn();

    const outcome = await runDevSeed(
      'development',
      'localhost:5432',
      world.deps,
      DEV_DATASET,
      log,
    );

    expect(outcome).toBe('seeded');
    expect((log.mock.calls as [[string]])[0][0]).toBe(
      'Seeding dev data. Target database host: localhost:5432.',
    );
    expect(world.users).toHaveLength(DEV_DATASET.users.length);
  });
});
