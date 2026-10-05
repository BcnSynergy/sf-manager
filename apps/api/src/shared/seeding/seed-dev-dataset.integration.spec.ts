import { Test, TestingModule } from '@nestjs/testing';
import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../../modules/checklist-question/application/ports/checklist-question.repository.port';
import {
  COMMUNITY_REPOSITORY,
  type CommunityRepository,
} from '../../modules/community/application/ports/community.repository.port';
import {
  COMMUNITY_REPRESENTATIVE_REPOSITORY,
  type CommunityRepresentativeRepository,
} from '../../modules/community/application/ports/community-representative.repository.port';
import {
  COMMUNITY_TECHNICIAN_REPOSITORY,
  type CommunityTechnicianRepository,
} from '../../modules/community/application/ports/community-technician.repository.port';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../modules/inspectable-element/application/ports/inspectable-element.repository.port';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../../modules/maintenance-company/application/ports/maintenance-company.repository.port';
import {
  ORGANIZATION_PROFILE_REPOSITORY,
  type OrganizationProfileRepository,
} from '../../modules/organization-profile/application/ports/organization-profile.repository.port';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../modules/review-template/application/ports/review-template.repository.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../modules/users/application/ports/user.repository.port';
import { CreateUserUseCase } from '../../modules/users/application/use-cases/create-user.use-case';
import { DeactivateTechnicianUseCase } from '../../modules/community/application/use-cases/deactivate-technician.use-case';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../../modules/review-session/application/ports/review-session.repository.port';
import type { Actor } from '../../modules/review-session/application/services/session-access.service';
import { CompleteReviewSessionUseCase } from '../../modules/review-session/application/use-cases/complete-review-session.use-case';
import { ListReviewHistoryUseCase } from '../../modules/review-session/application/use-cases/list-review-history.use-case';
import { OpenReviewSessionUseCase } from '../../modules/review-session/application/use-cases/open-review-session.use-case';
import { RecordEntryUseCase } from '../../modules/review-session/application/use-cases/record-entry.use-case';
import { ActivateReviewTemplateUseCase } from '../../modules/review-template/application/use-cases/activate-review-template.use-case';
import { CreateDraftReviewTemplateUseCase } from '../../modules/review-template/application/use-cases/create-draft-review-template.use-case';
import { SetReviewTemplateQuestionsUseCase } from '../../modules/review-template/application/use-cases/set-review-template-questions.use-case';
import { AppModule } from '../../app.module';
import { PrismaService } from '../infrastructure/persistence/prisma.service';
import {
  DEV_DATASET,
  type DevDataset,
  type SeededFrequency,
} from './dev-dataset';
import { planTemplate } from './dev-seed-plan';
import { resolveDevSeedDeps, seedDevDataset } from './seed-dev-dataset';

// dev-seed-data design.md "Testing Strategy": the integration spec calls
// seedDevDataset directly (Jest's NODE_ENV=test would close the gate; the
// gate itself is unit-tested). It runs on AppModule against this run's own
// database, which every spec in the run shares (E7), so:
// - every scenario derives its OWN dataset from a suffix (`buildDataset`),
//   which makes emails, tax ids and names unique per scenario;
// - assertions read through ports, never PrismaService (ADR-013), and only
//   for those natural keys, never global counts.
jest.setTimeout(60_000);

// Emails and tax ids stay canonical (lower-case email, upper-case tax id) so
// the derived dataset still matches its natural keys after the schemas'
// normalization. The organization profile and the two template lineages
// (QUARTERLY and ANNUAL) are global, so they are not suffixed; the tests
// below branch on each lineage kind. The dataset keeps both templates and
// tags its questions for both, so a scenario that must own its lineages calls
// `resetLineage` for each frequency before seeding.
const FREQUENCIES: SeededFrequency[] = ['QUARTERLY', 'ANNUAL'];

function buildDataset(suffix: string): DevDataset {
  const upper = suffix.toUpperCase();
  const community = (name: string) => `${name} ${suffix}`;
  return {
    ...DEV_DATASET,
    communities: DEV_DATASET.communities.map((c) => ({
      ...c,
      name: community(c.name),
    })),
    assignments: DEV_DATASET.assignments.map((a) => ({
      ...a,
      communityName: community(a.communityName),
      userEmail: a.userEmail.replace('@', `-${suffix}@`),
    })),
    elements: DEV_DATASET.elements.map((e) => ({
      ...e,
      communityName: community(e.communityName),
      name: `${e.name} ${suffix}`,
    })),
    questions: DEV_DATASET.questions.map((q) => ({
      ...q,
      text: `${q.text} ${suffix}`,
    })),
    sessions: DEV_DATASET.sessions.map((s) => ({
      ...s,
      performerEmail: s.performerEmail.replace('@', `-${suffix}@`),
      communityName: community(s.communityName),
      entries: s.entries.map((e) => ({
        ...e,
        elementName: `${e.elementName} ${suffix}`,
      })),
    })),
    password: DEV_DATASET.password,
    companies: DEV_DATASET.companies.map((company) => ({
      ...company,
      name: `${company.name} ${suffix}`,
      taxId: `${company.taxId}${upper}`,
    })),
    users: DEV_DATASET.users.map((user) => ({
      ...user,
      email: user.email.replace('@', `-${suffix}@`),
      ...(user.companyTaxId !== undefined && {
        companyTaxId: `${user.companyTaxId}${upper}`,
      }),
    })),
  };
}

describe('seedDevDataset (integration)', () => {
  let moduleRef: TestingModule;
  let userRepository: UserRepository;
  let companyRepository: MaintenanceCompanyRepository;
  let communityRepository: CommunityRepository;
  let representativeRepository: CommunityRepresentativeRepository;
  let technicianRepository: CommunityTechnicianRepository;
  let elementRepository: InspectableElementRepository;
  let questionRepository: ChecklistQuestionRepository;
  let templateRepository: ReviewTemplateRepository;
  let profileRepository: OrganizationProfileRepository;
  let sessionRepository: ReviewSessionRepository;
  // The template outcomes are asserted on the FIRST seed run of this file,
  // made in beforeAll before any other seeding: later runs always see the
  // templates this one activated (or leftovers), so they cannot prove the
  // create path. One outcome per lineage.
  let templateRun: {
    outcomes: Awaited<ReturnType<typeof seedDevDataset>>;
    initialKind: Record<
      SeededFrequency,
      Awaited<ReturnType<typeof lineageKind>>
    >;
    before: Record<SeededFrequency, { id: string; status: string }[]>;
    logs: string[];
    data: DevDataset;
  };
  let logs: string[];
  const log = (line: string) => logs.push(line);

  beforeAll(async () => {
    // AppModule's AuthModule throws at boot without these.
    process.env.JWT_SECRET = 'seed-integration-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();

    userRepository = moduleRef.get<UserRepository>(USER_REPOSITORY);
    companyRepository = moduleRef.get<MaintenanceCompanyRepository>(
      MAINTENANCE_COMPANY_REPOSITORY,
    );
    communityRepository =
      moduleRef.get<CommunityRepository>(COMMUNITY_REPOSITORY);
    representativeRepository = moduleRef.get<CommunityRepresentativeRepository>(
      COMMUNITY_REPRESENTATIVE_REPOSITORY,
    );
    technicianRepository = moduleRef.get<CommunityTechnicianRepository>(
      COMMUNITY_TECHNICIAN_REPOSITORY,
    );
    elementRepository = moduleRef.get<InspectableElementRepository>(
      INSPECTABLE_ELEMENT_REPOSITORY,
    );
    questionRepository = moduleRef.get<ChecklistQuestionRepository>(
      CHECKLIST_QUESTION_REPOSITORY,
    );
    templateRepository = moduleRef.get<ReviewTemplateRepository>(
      REVIEW_TEMPLATE_REPOSITORY,
    );
    profileRepository = moduleRef.get<OrganizationProfileRepository>(
      ORGANIZATION_PROFILE_REPOSITORY,
    );
    sessionRepository = moduleRef.get<ReviewSessionRepository>(
      REVIEW_SESSION_REPOSITORY,
    );

    const data = buildDataset('i9');
    const runLogs: string[] = [];
    const initialKind = {
      QUARTERLY: await lineageKind('QUARTERLY'),
      ANNUAL: await lineageKind('ANNUAL'),
    };
    const before = {
      QUARTERLY: await lineage('QUARTERLY'),
      ANNUAL: await lineage('ANNUAL'),
    };
    const outcomes = await seedDevDataset(
      resolveDevSeedDeps(moduleRef),
      data,
      (line) => runLogs.push(line),
    );
    templateRun = { outcomes, initialKind, before, logs: runLogs, data };
  });

  beforeEach(() => {
    logs = [];
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function seededCompanies(data: DevDataset) {
    const taxIds = new Set(data.companies.map((c) => c.taxId));
    return (await companyRepository.findAll()).filter((c) =>
      taxIds.has(c.taxId),
    );
  }

  async function seededUsers(data: DevDataset) {
    const found = await Promise.all(
      data.users.map((u) => userRepository.findByEmail(u.email)),
    );
    return found.filter((u) => u !== null);
  }

  async function seededCommunities(data: DevDataset) {
    const names = new Set(data.communities.map((c) => c.name));
    return (await communityRepository.findAll()).filter((c) =>
      names.has(c.name),
    );
  }

  // Everything the catalog steps wrote, keyed by id.
  async function catalogSnapshot(data: DevDataset) {
    const communities = await seededCommunities(data);
    const elements = (
      await Promise.all(
        communities.map((c) => elementRepository.findAllByCommunity(c.id)),
      )
    ).flat();
    const assignments = (
      await Promise.all(
        communities.flatMap((c) => [
          representativeRepository.listByCommunity(c.id),
          technicianRepository.listByCommunity(c.id),
        ]),
      )
    ).flat();
    const texts = new Set(data.questions.map((q) => q.text));
    const questions = (await questionRepository.findAll()).filter((q) =>
      texts.has(q.text),
    );
    return {
      communities: communities.map((c) => c.id).sort(),
      elements: elements.map((e) => e.id).sort(),
      assignments: assignments.map((a) => a.id).sort(),
      questions: questions.map((q) => q.id).sort(),
    };
  }

  async function lineage(frequency: SeededFrequency) {
    return (await templateRepository.findAll()).filter(
      (t) => t.elementType === 'EXTINGUISHER' && t.frequency === frequency,
    );
  }

  // Every frequency of the only element type is already used by another spec
  // file (they leave active templates without questions behind), so no
  // lineage is free. A scenario that must not depend on leftovers takes one
  // over instead: drafts deleted and the active version retired. Safe
  // because the suite runs in band (`--runInBand`) and those files reset
  // the lineages they use. This is setup, so it is the one place the spec
  // uses PrismaService: no use case retires an active template.
  async function resetLineage(frequency: SeededFrequency) {
    const prisma = moduleRef.get(PrismaService);
    const where = { elementType: 'EXTINGUISHER' as const, frequency };
    await prisma.reviewTemplate.deleteMany({
      where: { ...where, status: 'draft' },
    });
    await prisma.reviewTemplate.updateMany({
      where: { ...where, status: 'active' },
      data: { status: 'retired' },
    });
  }

  async function lineageKind(frequency: SeededFrequency) {
    const templates = await lineage(frequency);
    const active = templates.find((t) => t.status === 'active');
    const snapshot = active
      ? await templateRepository.findFrozenWithSnapshot(active.id)
      : null;
    return planTemplate(
      templates,
      active ? (snapshot?.questions.length ?? 0) : null,
    ).kind;
  }

  it('seeds the catalog: communities, assignments, elements and questions', async () => {
    const data = buildDataset('f6');

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    const communities = await seededCommunities(data);
    expect(communities.map((c) => c.name).sort()).toEqual(
      data.communities.map((c) => c.name).sort(),
    );
    const idOf = (name: string) => communities.find((c) => c.name === name)!.id;
    const users = await seededUsers(data);
    const userId = (email: string) => users.find((u) => u.email === email)!.id;
    for (const a of data.assignments) {
      const repository =
        a.as === 'REPRESENTATIVE'
          ? representativeRepository
          : technicianRepository;
      const record = await repository.findByCommunityAndUser(
        idOf(a.communityName),
        userId(a.userEmail),
      );
      expect(record?.deactivatedAt).toBeNull();
    }
    for (const c of data.communities) {
      const names = (await elementRepository.findAllByCommunity(idOf(c.name)))
        .map((e) => e.name)
        .sort();
      expect(names).toEqual(
        data.elements
          .filter((e) => e.communityName === c.name)
          .map((e) => e.name)
          .sort(),
      );
    }
    expect((await catalogSnapshot(data)).questions).toHaveLength(
      data.questions.length,
    );
  });

  it('overwrites the organization profile with the seeded values', async () => {
    const data = buildDataset('g7');
    await profileRepository.update({
      name: 'Changed by QA',
      legalName: 'Changed by QA',
      taxId: 'X0000000X',
      address: 'Elsewhere',
      phone: '0',
      email: 'qa@example.test',
    });

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    expect(await profileRepository.get()).toMatchObject(data.profile);
  });

  it('a second run leaves the catalog unchanged and only logs skips', async () => {
    const data = buildDataset('h8');
    const deps = resolveDevSeedDeps(moduleRef);

    await seedDevDataset(deps, data, log);
    const afterFirst = await catalogSnapshot(data);
    const lineagesAfterFirst = await Promise.all(FREQUENCIES.map(lineage));

    logs = [];
    await seedDevDataset(deps, data, log);

    expect(afterFirst.assignments).toHaveLength(data.assignments.length);
    expect(afterFirst.elements).toHaveLength(data.elements.length);
    expect(await catalogSnapshot(data)).toEqual(afterFirst);
    expect(
      (await Promise.all(FREQUENCIES.map(lineage)))
        .flat()
        .map((t) => t.id)
        .sort(),
    ).toEqual(
      lineagesAfterFirst
        .flat()
        .map((t) => t.id)
        .sort(),
    );
    // Equal ids alone would also hold if a regressed lookup made a create
    // throw and the seed swallowed it, so pin the logs. Template skips are
    // WARN lines by design and depend on what other specs left in the lineage.
    expect(
      logs.filter(
        (l) =>
          /^WARN/.test(l) &&
          !/^WARN: ((draft|active template) |no usable template \()/.test(l),
      ),
    ).toEqual([]);
    expect(logs.filter((l) => /^Seeded /.test(l))).toEqual([]);
    for (const c of data.communities) {
      expect(logs).toContain(`Community ${c.name} already exists, skipping.`);
    }
    for (const e of data.elements) {
      expect(logs).toContain(`Element ${e.name} already exists, skipping.`);
    }
    for (const q of data.questions) {
      expect(logs).toContain(`Question "${q.text}" already exists, skipping.`);
    }
    expect(
      logs.filter((l) => /^Assignment .* already exists, skipping\.$/.test(l)),
    ).toHaveLength(data.assignments.length);
  });

  it.each(FREQUENCIES)(
    'follows the %s lineage plan on the first run without touching foreign rows',
    async (frequency) => {
      const {
        outcomes,
        initialKind,
        before,
        logs: runLogs,
        data,
      } = templateRun;
      const kind = outcomes[frequency];
      const startKind = initialKind[frequency];
      const templateName = data.templates.find(
        (t) => t.frequency === frequency,
      )!.name;
      const after = await lineage(frequency);
      const seeded = runLogs.filter((l) => /^Seeded template: /.test(l));
      expect(kind).toBe(startKind);

      if (startKind === 'create' || startKind === 'finish-draft') {
        const active = after.find((t) => t.status === 'active')!;
        const snapshot = await templateRepository.findFrozenWithSnapshot(
          active.id,
        );
        expect(snapshot!.questions.map((q) => q.text).sort()).toEqual(
          data.questions.map((q) => q.text).sort(),
        );
        expect(seeded).toContain(`Seeded template: ${templateName}`);
        return;
      }
      // Nothing in the lineage changed: same rows, same statuses.
      const shape = (rows: { id: string; status: string }[]) =>
        rows.map((t) => `${t.id}:${t.status}`).sort();
      expect(shape(after)).toEqual(shape(before[frequency]));
      expect(seeded).not.toContain(`Seeded template: ${templateName}`);
      expect(runLogs).toContainEqual(
        expect.stringMatching(
          startKind === 'use-active'
            ? /^Active template .* exists, using it.$/
            : /^WARN: (draft|active template) /,
        ),
      );
    },
  );

  it('seeds both companies and all six users with the right roles and companies', async () => {
    const data = buildDataset('a1');

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    const companies = await seededCompanies(data);
    expect(companies.map((c) => c.name).sort()).toEqual(
      data.companies.map((c) => c.name).sort(),
    );
    const companyIdByTaxId = new Map(companies.map((c) => [c.taxId, c.id]));

    const users = await seededUsers(data);
    expect(users).toHaveLength(data.users.length);
    for (const dev of data.users) {
      const user = users.find((u) => u.email === dev.email)!;
      expect(user.role).toBe(dev.role);
      expect(user.maintenanceCompanyId).toBe(
        dev.companyTaxId === undefined
          ? null
          : companyIdByTaxId.get(dev.companyTaxId),
      );
    }
  });

  it('grants VIEW_ALL_REVIEWS to exactly one of the two seeded managers', async () => {
    const data = buildDataset('b2');

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    const managers = (await seededUsers(data)).filter(
      (u) => u.role === 'MANAGER',
    );
    expect(managers).toHaveLength(2);
    const withCapability = managers.filter((m) =>
      m.managerCapabilities.includes('VIEW_ALL_REVIEWS'),
    );
    expect(withCapability.map((m) => m.email)).toEqual([
      data.users.find((u) => u.managerCapabilities)!.email,
    ]);
  });

  it('a second run creates no duplicates and keeps ids and counts equal', async () => {
    const data = buildDataset('c3');
    const deps = resolveDevSeedDeps(moduleRef);

    await seedDevDataset(deps, data, log);
    const companiesAfterFirst = await seededCompanies(data);
    const usersAfterFirst = await seededUsers(data);

    logs = [];
    await seedDevDataset(deps, data, log);
    const companiesAfterSecond = await seededCompanies(data);
    const usersAfterSecond = await seededUsers(data);

    expect(companiesAfterFirst).toHaveLength(data.companies.length);
    expect(usersAfterFirst).toHaveLength(data.users.length);
    expect(companiesAfterSecond.map((c) => c.id).sort()).toEqual(
      companiesAfterFirst.map((c) => c.id).sort(),
    );
    expect(usersAfterSecond.map((u) => u.id).sort()).toEqual(
      usersAfterFirst.map((u) => u.id).sort(),
    );
    // Ids and counts alone would also hold if a regressed lookup made
    // createUser throw and the seed swallowed it as a WARN, so pin the logs.
    expect(logs.filter((l) => /^WARN/.test(l))).toEqual([]);
    expect(logs.filter((l) => /^Seeded /.test(l))).toEqual([]);
    for (const company of data.companies) {
      expect(logs).toContain(
        `Company ${company.name} already exists, skipping.`,
      );
    }
    for (const user of data.users) {
      expect(logs).toContain(`User ${user.email} already exists, skipping.`);
    }
  });

  it('warns about a drifted user, leaves its row untouched and seeds the rest', async () => {
    const data = buildDataset('d4');
    const technician = data.users[0];
    // Same email, wrong role: the shape of a hand-edited dev row.
    await moduleRef.get(CreateUserUseCase).execute({
      email: technician.email,
      password: data.password,
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    expect(logs).toContainEqual(
      expect.stringMatching(
        new RegExp(
          `WARN.*${technician.email}.*role is COMMUNITY_REPRESENTATIVE`,
        ),
      ),
    );
    const untouched = await userRepository.findByEmail(technician.email);
    expect(untouched?.role).toBe('COMMUNITY_REPRESENTATIVE');
    expect(untouched?.maintenanceCompanyId).toBeNull();
    expect(await seededUsers(data)).toHaveLength(data.users.length);
    // A blocked user gets no assignment; the rest of the catalog is seeded.
    for (const community of await seededCommunities(data)) {
      expect(
        await technicianRepository.findByCommunityAndUser(
          community.id,
          untouched!.id,
        ),
      ).toBeNull();
    }
    expect(logs).toContainEqual(
      expect.stringMatching(
        new RegExp(`WARN.*${technician.email}.*assignment`),
      ),
    );
    expect((await catalogSnapshot(data)).elements).toHaveLength(
      data.elements.length,
    );
  });

  it('warns about a soft-deleted seeded email, skips it and seeds the rest', async () => {
    const data = buildDataset('e5');
    const rep = data.users.find((u) => u.role === 'COMMUNITY_REPRESENTATIVE')!;
    const { id } = await moduleRef.get(CreateUserUseCase).execute({
      email: rep.email,
      password: data.password,
      role: 'COMMUNITY_REPRESENTATIVE',
    });
    await userRepository.softDeleteById(id);

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    expect(logs).toContainEqual(
      expect.stringMatching(new RegExp(`WARN.*${rep.email}.*soft-deleted`)),
    );
    expect(await userRepository.findByEmail(rep.email)).toBeNull();
    expect(await seededUsers(data)).toHaveLength(data.users.length - 1);
    // Without its representative the community keeps none, but is still seeded.
    const communities = await seededCommunities(data);
    expect(communities).toHaveLength(data.communities.length);
    for (const community of communities) {
      expect(
        await representativeRepository.findActiveByCommunity(community.id),
      ).toBeNull();
    }
  });
  describe('sessions', () => {
    const label = (s: { performerEmail: string; communityName: string }) =>
      `${s.performerEmail}|${s.communityName}`;
    const admin: Actor = { userId: 'seed-admin', role: 'SYSTEM_ADMIN' };

    async function actors(data: DevDataset) {
      const users = await seededUsers(data);
      const communities = await seededCommunities(data);
      return {
        actor: (email: string): Actor => {
          const user = users.find((u) => u.email === email)!;
          return { userId: user.id, role: user.role };
        },
        communityId: (name: string) =>
          communities.find((c) => c.name === name)!.id,
      };
    }

    // A skipped template kind blocks the new sessions of its own frequency:
    // assert that opposite outcome per blocked lineage and let the caller
    // stop, as the assertions below need both lineages usable.
    function blockedByTemplate(
      outcomes: Awaited<ReturnType<typeof seedDevDataset>>,
    ) {
      const blocked = Object.values(outcomes).filter((kind) =>
        kind.startsWith('skip-'),
      );
      for (const kind of blocked) {
        expect(logs).toContainEqual(
          expect.stringContaining(`no usable template (${kind})`),
        );
      }
      return blocked.length > 0;
    }

    async function historyOf(actor: Actor, data: DevDataset) {
      const emails = new Set(data.users.map((u) => u.email));
      const rows = await moduleRef.get(ListReviewHistoryUseCase).execute(actor);
      return {
        rows,
        seeded: rows.filter((r) => emails.has(r.performedByEmail)),
      };
    }

    const labelsOf = (
      rows: { performedByEmail: string; communityName: string }[],
    ) => rows.map((r) => `${r.performedByEmail}|${r.communityName}`).sort();

    it('scopes the seeded history per role and never backdates', async () => {
      const data = buildDataset('j10');
      const startedAfter = new Date();

      const outcomes = await seedDevDataset(
        resolveDevSeedDeps(moduleRef),
        data,
        log,
      );

      if (blockedByTemplate(outcomes)) {
        return;
      }
      const { actor } = await actors(data);
      const [s1, s2, s3, s4] = data.sessions.map(label);
      const email = (prefix: string) =>
        data.users.find((u) => u.email.startsWith(`${prefix}-`))!.email;
      const seededFor = async (prefix: string) =>
        labelsOf((await historyOf(actor(email(prefix)), data)).seeded);

      // s1 and s4 are the QUARTERLY and the ANNUAL session of the same pair.
      expect(await seededFor('technician')).toEqual([s1, s2, s4].sort());
      expect(await seededFor('companymgr')).toEqual([s1, s2, s4].sort());
      expect(await seededFor('rep')).toEqual([s1, s4].sort());
      expect(await seededFor('technician2')).toEqual([s3]);
      const adminList = await historyOf(admin, data);
      expect(labelsOf(adminList.seeded)).toEqual([s1, s2, s3, s4].sort());
      const managerList = await historyOf(actor(email('manager')), data);
      expect(managerList.rows.map((r) => r.id).sort()).toEqual(
        adminList.rows.map((r) => r.id).sort(),
      );
      expect(
        (await historyOf(actor(email('manager-nocap')), data)).rows,
      ).toEqual([]);
      for (const row of adminList.seeded) {
        expect(row.startedAt.getTime()).toBeGreaterThanOrEqual(
          startedAfter.getTime(),
        );
        expect(row.completedAt.getTime()).toBeGreaterThanOrEqual(
          startedAfter.getTime(),
        );
      }
    });

    it('heals a session that crashed right after opening, without a second draft', async () => {
      const data = buildDataset('k11');
      const deps = resolveDevSeedDeps(moduleRef);
      const outcomes = await seedDevDataset(
        deps,
        { ...data, sessions: [] },
        log,
      );
      if (blockedByTemplate(outcomes)) {
        return;
      }
      const { actor, communityId } = await actors(data);
      const [s1] = data.sessions;
      const performer = actor(s1.performerEmail);
      const active = (await lineage('QUARTERLY')).find(
        (t) => t.status === 'active',
      )!;
      const opened = await moduleRef.get(OpenReviewSessionUseCase).execute({
        communityId: communityId(s1.communityName),
        templateId: active.id,
        performedById: performer.userId,
        role: performer.role,
      });
      logs = [];

      await seedDevDataset(deps, data, log);

      const completed = await sessionRepository.findCompletedForPerformer(
        performer.userId,
      );
      // The ANNUAL session of the same pair is a different key.
      expect(
        completed
          .filter(
            (s) =>
              s.communityId === communityId(s1.communityName) &&
              s.templateId === active.id,
          )
          .map((s) => s.id),
      ).toEqual([opened.id]);
      const healed = await sessionRepository.findByIdForPerformer(
        opened.id,
        performer.userId,
      );
      expect(healed!.entries).toHaveLength(s1.entries.length);
      expect(
        await sessionRepository.findDraftsByPerformer(performer.userId),
      ).toEqual([]);
      expect(logs.filter((l) => /^WARN/.test(l))).toEqual([]);
    });

    it('does not reopen a seeded draft that QA completed', async () => {
      const data = buildDataset('m13');
      const deps = resolveDevSeedDeps(moduleRef);
      const outcomes = await seedDevDataset(deps, data, log);
      if (blockedByTemplate(outcomes)) {
        return;
      }
      const { actor, communityId } = await actors(data);
      const draftPlan = data.sessions.find((s) => !s.complete)!;
      const rep = actor(draftPlan.performerEmail);
      const [draft] = await sessionRepository.findDraftsByPerformer(rep.userId);
      const missing = (
        await elementRepository.findAllByCommunity(
          communityId(draftPlan.communityName),
        )
      ).find((e) => e.name !== draftPlan.entries[0].elementName)!;
      await moduleRef
        .get(RecordEntryUseCase)
        .execute(
          draft.id,
          missing.id,
          { kind: 'unreviewed', observations: 'Checked by QA.' },
          rep,
        );
      await moduleRef.get(CompleteReviewSessionUseCase).execute(draft.id, rep);
      logs = [];

      await seedDevDataset(deps, data, log);

      expect(await sessionRepository.findDraftsByPerformer(rep.userId)).toEqual(
        [],
      );
      expect(
        (await sessionRepository.findCompletedForPerformer(rep.userId)).map(
          (s) => s.id,
        ),
      ).toEqual([draft.id]);
      expect(logs.filter((l) => /^(Seeded|WARN)/.test(l))).toEqual([]);
    });

    it('keeps a QA-edited entry on rerun', async () => {
      const data = buildDataset('p16');
      const deps = resolveDevSeedDeps(moduleRef);
      const outcomes = await seedDevDataset(deps, data, log);
      if (blockedByTemplate(outcomes)) {
        return;
      }
      const { actor, communityId } = await actors(data);
      const draftPlan = data.sessions.find((s) => !s.complete)!;
      const rep = actor(draftPlan.performerEmail);
      const [draft] = await sessionRepository.findDraftsByPerformer(rep.userId);
      const element = (
        await elementRepository.findAllByCommunity(
          communityId(draftPlan.communityName),
        )
      ).find((e) => e.name === draftPlan.entries[0].elementName)!;
      const snapshot = await templateRepository.findFrozenWithSnapshot(
        draft.templateId,
      );
      await moduleRef.get(RecordEntryUseCase).execute(
        draft.id,
        element.id,
        {
          kind: 'reviewed',
          answers: snapshot!.questions.map((q) => ({
            questionId: q.questionId,
            value: 'NO' as const,
          })),
        },
        rep,
      );

      await seedDevDataset(deps, data, log);

      const after = await sessionRepository.findByIdForPerformer(
        draft.id,
        rep.userId,
      );
      expect(after!.entries).toHaveLength(1);
      expect(after!.entries[0].answers.map((a) => a.answer)).toEqual(
        Array(snapshot!.questions.length).fill('NO'),
      );
    });

    it('resumes against its own template after a newer version, with no second draft', async () => {
      // Own lineages, emptied first: the scenario never depends on leftovers.
      const data = buildDataset('n14');
      const deps = resolveDevSeedDeps(moduleRef);
      await resetLineage('QUARTERLY');
      await resetLineage('ANNUAL');
      const outcomes = await seedDevDataset(
        deps,
        { ...data, sessions: [] },
        log,
      );
      expect(outcomes).toEqual({ QUARTERLY: 'create', ANNUAL: 'create' });
      for (const frequency of FREQUENCIES) {
        const fresh = await lineage(frequency);
        expect(fresh.filter((t) => t.status === 'active')).toHaveLength(1);
        expect(fresh.filter((t) => t.status === 'draft')).toEqual([]);
      }
      const { actor, communityId } = await actors(data);
      const [s1] = data.sessions;
      expect(s1.frequency).toBe('QUARTERLY');
      const performer = actor(s1.performerEmail);
      const old = (await lineage('QUARTERLY')).find(
        (t) => t.status === 'active',
      )!;
      const oldCount = (await templateRepository.findFrozenWithSnapshot(
        old.id,
      ))!.questions.length;
      const opened = await moduleRef.get(OpenReviewSessionUseCase).execute({
        communityId: communityId(s1.communityName),
        templateId: old.id,
        performedById: performer.userId,
        role: performer.role,
      });
      // One question only: answers built from the new version would not match
      // the session's own template.
      const seededTexts = new Set(data.questions.map((q) => q.text));
      const [firstQuestion] = (await questionRepository.findAll()).filter((q) =>
        seededTexts.has(q.text),
      );
      const { id: draftId } = await moduleRef
        .get(CreateDraftReviewTemplateUseCase)
        .execute(data.templates[0]);
      await moduleRef.get(SetReviewTemplateQuestionsUseCase).execute({
        templateId: draftId,
        questionIds: [firstQuestion.id],
      });
      await moduleRef.get(ActivateReviewTemplateUseCase).execute(draftId);

      await seedDevDataset(deps, data, log);

      const quarterlyIds = new Set(
        (await lineage('QUARTERLY')).map((t) => t.id),
      );
      const sessions = (
        await sessionRepository.findCompletedForPerformer(performer.userId)
      ).filter(
        (s) =>
          s.communityId === communityId(s1.communityName) &&
          quarterlyIds.has(s.templateId),
      );
      expect(sessions.map((s) => [s.id, s.templateId])).toEqual([
        [opened.id, old.id],
      ]);
      const done = await sessionRepository.findByIdForPerformer(
        opened.id,
        performer.userId,
      );
      expect(done!.entries).toHaveLength(s1.entries.length);
      const reviewed = done!.entries.filter((e) => e.answers.length > 0);
      expect(reviewed.length).toBeGreaterThan(0);
      for (const entry of reviewed) {
        expect(entry.answers).toHaveLength(oldCount);
      }
      expect(
        await sessionRepository.findDraftsByPerformer(performer.userId),
      ).toEqual([]);
    });

    it('a second run keeps four completed sessions, one ANNUAL template and one ANNUAL session', async () => {
      const data = buildDataset('r18');
      const deps = resolveDevSeedDeps(moduleRef);
      await resetLineage('QUARTERLY');
      await resetLineage('ANNUAL');

      await seedDevDataset(deps, data, log);
      logs = [];
      await seedDevDataset(deps, data, log);

      const annual = await lineage('ANNUAL');
      expect(annual.filter((t) => t.status === 'active')).toHaveLength(1);
      expect(annual.filter((t) => t.status === 'draft')).toEqual([]);
      const annualIds = new Set(annual.map((t) => t.id));
      const { actor, communityId } = await actors(data);
      const performers = [
        ...new Set(data.sessions.map((s) => s.performerEmail)),
      ].map(actor);
      const completed = (
        await Promise.all(
          performers.map((p) =>
            sessionRepository.findCompletedForPerformer(p.userId),
          ),
        )
      ).flat();
      expect(completed).toHaveLength(4);
      const annualSessions = completed.filter((s) =>
        annualIds.has(s.templateId),
      );
      expect(annualSessions).toHaveLength(1);
      expect(annualSessions[0].communityId).toBe(
        communityId(
          data.sessions.find((s) => s.frequency === 'ANNUAL')!.communityName,
        ),
      );
      expect(logs.filter((l) => /^(Seeded|WARN)/.test(l))).toEqual([]);
    });

    it('skips an ANNUAL seed draft it cannot finish with a warning, blocks only ANNUAL, and finishes it on a later run', async () => {
      const data = buildDataset('u21');
      const deps = resolveDevSeedDeps(moduleRef);
      await resetLineage('QUARTERLY');
      await resetLineage('ANNUAL');
      const { id: draftId } = await moduleRef
        .get(CreateDraftReviewTemplateUseCase)
        .execute(data.templates.find((t) => t.frequency === 'ANNUAL')!);
      // QA removes every seeded question after the draft got its selection and
      // before activation: the real Activate then throws
      // ReviewTemplateEmptyError from the repository. Only the seed draft is
      // raced; the QUARTERLY template is created and activated before it.
      const setQuestions = deps.setTemplateQuestions;
      const racy = {
        ...deps,
        setTemplateQuestions: {
          execute: async (input: {
            templateId: string;
            questionIds: string[];
          }) => {
            await setQuestions.execute(input);
            if (input.templateId !== draftId) {
              return;
            }
            await Promise.all(
              input.questionIds.map((id) =>
                questionRepository.softDeleteById(id),
              ),
            );
          },
        },
      };

      const outcomes = await seedDevDataset(racy, data, log);

      expect(outcomes).toEqual({
        QUARTERLY: 'create',
        ANNUAL: 'skip-unfinishable-draft',
      });
      expect(logs).toContainEqual(
        expect.stringContaining(
          `WARN: draft ${draftId} cannot be finished (ReviewTemplateEmptyError`,
        ),
      );
      expect(
        (await lineage('ANNUAL')).filter((t) => t.status !== 'retired'),
      ).toMatchObject([{ id: draftId, status: 'draft' }]);
      expect(logs).toContainEqual(
        expect.stringContaining('no usable template (skip-unfinishable-draft)'),
      );
      // The QUARTERLY sessions were still seeded; the ANNUAL one was not.
      const { actor } = await actors(data);
      const technician = actor(
        data.sessions.find((s) => s.frequency === 'ANNUAL')!.performerEmail,
      );
      const quarterlyIds = new Set(
        (await lineage('QUARTERLY')).map((t) => t.id),
      );
      const completed = await sessionRepository.findCompletedForPerformer(
        technician.userId,
      );
      expect(completed.length).toBeGreaterThan(0);
      expect(completed.every((s) => quarterlyIds.has(s.templateId))).toBe(true);

      logs = [];
      const retried = await seedDevDataset(deps, data, log);

      expect(retried.ANNUAL).toBe('finish-draft');
      expect(
        (await lineage('ANNUAL')).find((t) => t.id === draftId)!.status,
      ).toBe('active');
    });

    it('skips a session whose assignment QA deactivated, with a warning', async () => {
      const data = buildDataset('q17');
      const deps = resolveDevSeedDeps(moduleRef);
      const outcomes = await seedDevDataset(
        deps,
        { ...data, sessions: [] },
        log,
      );
      if (blockedByTemplate(outcomes)) {
        return;
      }
      const { actor, communityId } = await actors(data);
      const s3 = data.sessions[2];
      const technician2 = actor(s3.performerEmail);
      await moduleRef.get(DeactivateTechnicianUseCase).execute({
        communityId: communityId(s3.communityName),
        userId: technician2.userId,
      });
      logs = [];

      await seedDevDataset(deps, data, log);

      expect(logs).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `^WARN: skipped open session of ${s3.performerEmail} in ${s3.communityName}: CommunityNotInScopeError`,
          ),
        ),
      );
      expect(
        await sessionRepository.findCompletedForPerformer(technician2.userId),
      ).toEqual([]);
      // The rest of the run went on.
      const { seeded } = await historyOf(admin, data);
      expect(labelsOf(seeded)).toEqual(
        [data.sessions[0], data.sessions[1], data.sessions[3]]
          .map(label)
          .sort(),
      );
    });
  });
});
