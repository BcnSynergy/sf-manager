import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { RemoveOrganizationLogoUseCase } from '../../modules/organization-profile/application/use-cases/remove-organization-logo.use-case';
import { detectLogoFormat } from '../../modules/organization-profile/domain/organization-logo';
import {
  FILE_STORAGE,
  type FileStorage,
} from '../application/ports/file-storage.port';
import { AppModule } from '../../app.module';
import { PrismaService } from '../infrastructure/persistence/prisma.service';
import { DEMO_DATASET } from './demo-dataset';
import { buildDevSignaturePng } from './dev-seed-signature';
import { backdatedSessionTimes } from './seed-dev-dataset';
import { resolveDemoSeedDeps, seedDemoDataset } from './seed-demo-dataset';

// demo-seed-data: the demo dataset through the real use cases, Prisma and
// file storage. The nightly reset seeds a freshly migrated database; the
// run's shared test database already holds other specs' extinguisher
// templates, so beforeAll retires them and removes their drafts first, as
// a newer activation would. Every other natural key in the demo dataset is
// unique to it.
describe('seedDemoDataset (integration)', () => {
  const data = DEMO_DATASET;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let storage: FileStorage;
  let storageDir: string;
  // Bounds of the seeding run: backdateSession reads the clock per session,
  // so a run that crosses 00:00 UTC dates against either day.
  let seededAt: Date;
  let finishedAt: Date;
  const logs: string[] = [];

  beforeAll(async () => {
    // AppModule's AuthModule throws at boot without these.
    process.env.JWT_SECRET = 'seed-integration-jwt-secret-0123456789';
    process.env.THROTTLE_KEY_SECRET = 'test-throttle-key-secret-0123456789ab';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    storageDir = mkdtempSync(join(tmpdir(), 'sf-manager-demo-seed-files-'));
    process.env.FILE_STORAGE_DIR = storageDir;

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    storage = moduleRef.get<FileStorage>(FILE_STORAGE);

    await prisma.reviewTemplate.updateMany({
      where: { elementType: 'EXTINGUISHER', status: 'active' },
      data: { status: 'retired' },
    });
    await prisma.reviewTemplate.updateMany({
      where: { elementType: 'EXTINGUISHER', status: 'draft', deletedAt: null },
      data: { deletedAt: new Date() },
    });

    seededAt = new Date();
    await seedDemoDataset(resolveDemoSeedDeps(moduleRef), data, (line) =>
      logs.push(line),
    );
    finishedAt = new Date();
  });

  afterAll(async () => {
    // The profile row is shared by the whole run: later specs expect no logo.
    await moduleRef.get(RemoveOrganizationLogoUseCase).execute();
    await moduleRef.close();
    rmSync(storageDir, { recursive: true, force: true });
  });

  const userIdOf = async (email: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const communityIdOf = async (name: string) =>
    (await prisma.community.findFirstOrThrow({ where: { name } })).id;
  const demoCommunityIds = async () =>
    (
      await prisma.community.findMany({
        where: { name: { in: data.communities.map((c) => c.name) } },
      })
    ).map((c) => c.id);
  const demoSessions = async () =>
    prisma.reviewSession.findMany({
      where: { communityId: { in: await demoCommunityIds() } },
    });

  // The one session of a planned performer, community and frequency.
  const sessionOf = async (planned: (typeof data.sessions)[number]) => {
    const candidates = await prisma.reviewSession.findMany({
      where: {
        performedById: await userIdOf(planned.performerEmail),
        communityId: await communityIdOf(planned.communityName),
      },
    });
    const matching: typeof candidates = [];
    for (const candidate of candidates) {
      const template = await prisma.reviewTemplate.findUniqueOrThrow({
        where: { id: candidate.templateId },
      });
      if (template.frequency === planned.frequency) {
        matching.push(candidate);
      }
    }
    expect(matching).toHaveLength(1);
    return matching[0];
  };

  it('logs no warning', () => {
    expect(logs.filter((line) => line.startsWith('WARN'))).toEqual([]);
  });

  it('creates every extinguisher with its fixed code in its community', async () => {
    for (const element of data.elements) {
      const row = await prisma.inspectableElement.findUniqueOrThrow({
        where: { code: element.code },
      });
      expect(row.name).toBe(element.name);
      expect(row.communityId).toBe(await communityIdOf(element.communityName));
    }
  });

  it('activates a quarterly template with the fifteen T questions and an annual one with them plus the five A questions', async () => {
    const textsOf = async (frequency: 'QUARTERLY' | 'ANNUAL') => {
      const template = await prisma.reviewTemplate.findFirstOrThrow({
        where: { elementType: 'EXTINGUISHER', frequency, status: 'active' },
      });
      expect(template.name).toBe(
        data.templates.find((t) => t.frequency === frequency)!.name,
      );
      return (
        await prisma.reviewTemplateQuestion.findMany({
          where: { templateId: template.id },
          orderBy: { order: 'asc' },
        })
      ).map((q) => q.questionText);
    };
    const quarterly = data.questions
      .filter((q) => q.frequencies.includes('QUARTERLY'))
      .map((q) => q.text);

    expect(await textsOf('QUARTERLY')).toEqual(quarterly);
    expect(quarterly).toHaveLength(15);
    expect(await textsOf('ANNUAL')).toEqual(data.questions.map((q) => q.text));
  });

  it('seeds the planned sessions: eleven completed and one draft', async () => {
    const sessions = await demoSessions();
    expect(sessions.filter((s) => s.status === 'completed')).toHaveLength(11);
    expect(sessions.filter((s) => s.status === 'draft')).toHaveLength(1);
  });

  it('dates each completed session its daysAgo back, at 10:30 UTC, with its entries recorded inside it', async () => {
    for (const planned of data.sessions.filter((s) => s.complete)) {
      const session = await sessionOf(planned);
      const expected = [seededAt, finishedAt]
        .map((at) => backdatedSessionTimes(at, planned.daysAgo!))
        .find(
          (times) =>
            times.completedAt.getTime() === session.completedAt?.getTime(),
        );
      if (expected === undefined) {
        throw new Error(
          `unexpected completedAt ${session.completedAt?.toISOString()}`,
        );
      }
      expect(session.startedAt).toEqual(expected.startedAt);
      const entries = await prisma.elementReviewEntry.findMany({
        where: { reviewSessionId: session.id },
      });
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.recordedAt).toEqual(expected.recordedAt);
      }
    }
  });

  it('answers NO only on the question each NO entry names', async () => {
    const withNo = data.sessions.filter((s) =>
      s.entries.some((e) => e.outcome === 'NO'),
    );
    expect(withNo).toHaveLength(3);
    for (const planned of withNo) {
      const entry = planned.entries.find((e) => e.outcome === 'NO')!;
      const communityId = await communityIdOf(planned.communityName);
      const session = await sessionOf(planned);
      const element = await prisma.inspectableElement.findFirstOrThrow({
        where: { communityId, name: entry.elementName },
      });
      const reviewEntry = await prisma.elementReviewEntry.findUniqueOrThrow({
        where: {
          reviewSessionId_inspectableElementId: {
            reviewSessionId: session.id,
            inspectableElementId: element.id,
          },
        },
      });
      const answers = await prisma.questionAnswer.findMany({
        where: { elementReviewEntryId: reviewEntry.id, answer: 'NO' },
      });
      const questions = await prisma.reviewTemplateQuestion.findMany({
        where: {
          templateId: session.templateId,
          questionId: { in: answers.map((a) => a.questionId) },
        },
      });
      expect(questions.map((q) => q.questionText)).toEqual([entry.noOn]);
    }
  });

  it('attributes representative sessions to no company and technician sessions to theirs', async () => {
    for (const planned of data.sessions) {
      const performer = data.users.find(
        (u) => u.email === planned.performerEmail,
      )!;
      const session = await sessionOf(planned);
      if (performer.role === 'COMMUNITY_REPRESENTATIVE') {
        expect(session.performedByCompanyId).toBeNull();
      } else {
        const company = await prisma.maintenanceCompany.findUniqueOrThrow({
          where: { id: session.performedByCompanyId! },
        });
        expect(company.taxId).toBe(performer.companyTaxId);
      }
    }
  });

  it('registers each signer’s own signature image, and every completed session carries a signature copy', async () => {
    for (const signer of data.users.filter(
      (u) => u.signatureVariant !== undefined,
    )) {
      const row = await prisma.reviewerSignature.findUniqueOrThrow({
        where: { userId: await userIdOf(signer.email) },
      });
      expect(await storage.get(row.storageKey)).toEqual(
        buildDevSignaturePng(signer.signatureVariant),
      );
    }
    for (const session of (await demoSessions()).filter(
      (s) => s.status === 'completed',
    )) {
      expect(session.signatureStorageKey).not.toBeNull();
    }
  });

  it('sets the organization profile and its SVG logo', async () => {
    const profile = await prisma.organizationProfile.findFirstOrThrow();
    expect(profile).toMatchObject(data.profile);
    const logo = await storage.get(profile.logoAssetId!);
    expect(detectLogoFormat(logo!)?.contentType).toBe('image/svg+xml');
  });

  it('a second run creates nothing new and keeps every code', async () => {
    const before = await demoSessions();
    const runLogs: string[] = [];

    await seedDemoDataset(resolveDemoSeedDeps(moduleRef), data, (line) =>
      runLogs.push(line),
    );

    expect(await demoSessions()).toHaveLength(before.length);
    expect(
      await prisma.inspectableElement.count({
        where: { communityId: { in: await demoCommunityIds() } },
      }),
    ).toBe(data.elements.length);
    expect(runLogs.filter((line) => line.startsWith('Seeded'))).toEqual([]);
  });
});
