import {
  CHECKLIST_QUESTION_REPOSITORY,
  type ChecklistQuestionRepository,
} from '../../modules/checklist-question/application/ports/checklist-question.repository.port';
import { CreateChecklistQuestionUseCase } from '../../modules/checklist-question/application/use-cases/create-checklist-question.use-case';
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
import { AddRepresentativeUseCase } from '../../modules/community/application/use-cases/add-representative.use-case';
import { AddTechnicianUseCase } from '../../modules/community/application/use-cases/add-technician.use-case';
import { CreateCommunityUseCase } from '../../modules/community/application/use-cases/create-community.use-case';
import {
  INSPECTABLE_ELEMENT_REPOSITORY,
  type InspectableElementRepository,
} from '../../modules/inspectable-element/application/ports/inspectable-element.repository.port';
import { CreateInspectableElementUseCase } from '../../modules/inspectable-element/application/use-cases/create-inspectable-element.use-case';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../../modules/maintenance-company/application/ports/maintenance-company.repository.port';
import {
  CreateMaintenanceCompanyUseCase,
  type CreateMaintenanceCompanyInput,
} from '../../modules/maintenance-company/application/use-cases/create-maintenance-company.use-case';
import { UpdateOrganizationProfileUseCase } from '../../modules/organization-profile/application/use-cases/update-organization-profile.use-case';
import {
  REVIEW_TEMPLATE_REPOSITORY,
  type ReviewTemplateRepository,
} from '../../modules/review-template/application/ports/review-template.repository.port';
import { ActivateReviewTemplateUseCase } from '../../modules/review-template/application/use-cases/activate-review-template.use-case';
import { CreateDraftReviewTemplateUseCase } from '../../modules/review-template/application/use-cases/create-draft-review-template.use-case';
import { SetReviewTemplateQuestionsUseCase } from '../../modules/review-template/application/use-cases/set-review-template-questions.use-case';
import { InspectableElementNotFoundError } from '../../modules/inspectable-element/domain/errors/inspectable-element-not-found.error';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../../modules/review-session/application/ports/review-session.repository.port';
import type { Actor } from '../../modules/review-session/application/services/session-access.service';
import { CompleteReviewSessionUseCase } from '../../modules/review-session/application/use-cases/complete-review-session.use-case';
import {
  OpenReviewSessionUseCase,
  type OpenReviewSessionInput,
} from '../../modules/review-session/application/use-cases/open-review-session.use-case';
import {
  RecordEntryUseCase,
  type RecordEntryInput,
} from '../../modules/review-session/application/use-cases/record-entry.use-case';
import { ActiveTemplateNotFoundError } from '../../modules/review-session/domain/errors/active-template-not-found.error';
import { ReviewSessionNotFoundError } from '../../modules/review-session/domain/errors/review-session-not-found.error';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../modules/users/application/ports/user.repository.port';
import {
  CreateUserUseCase,
  type CreateUserInput,
} from '../../modules/users/application/use-cases/create-user.use-case';
import {
  UpdateUserUseCase,
  type UpdateUserInput,
} from '../../modules/users/application/use-cases/update-user.use-case';
import { EmailAlreadyInUseError } from '../../modules/users/domain/errors/email-already-in-use.error';
import type { User } from '../../modules/users/domain/user.entity';
import type { ManagerCapability } from '../../modules/users/domain/manager-capability';
import type {
  DevDataset,
  DevSession,
  DevSessionEntry,
  DevUser,
} from './dev-dataset';
import {
  describeUserDrift,
  findByNaturalKey,
  isExpectedSessionError,
  isExpectedTemplateError,
  planSession,
  planTemplate,
  type SessionPlan,
  type TemplatePlan,
} from './dev-seed-plan';
import { shouldSeedDevData } from './should-seed-dev-data';

type Log = (line: string) => void;

const RESET_HINT =
  'Run `prisma migrate reset` then `prisma db seed` to fix it.';

type UseCase<I, R = unknown> = { execute(input: I): Promise<R> };
type InputOf<U extends { execute(input: never): unknown }> = Parameters<
  U['execute']
>[0];

// Narrowest structural types the seed uses, so unit specs can pass fakes.
export interface DevSeedDeps {
  companyRepository: Pick<MaintenanceCompanyRepository, 'findAll'>;
  userRepository: Pick<UserRepository, 'findByEmail'>;
  createCompany: {
    execute(input: CreateMaintenanceCompanyInput): Promise<{ id: string }>;
  };
  createUser: {
    execute(
      input: CreateUserInput,
    ): Promise<{ id: string; managerCapabilities: ManagerCapability[] }>;
  };
  updateUser: { execute(input: UpdateUserInput): Promise<unknown> };
  updateProfile: UseCase<InputOf<UpdateOrganizationProfileUseCase>>;
  communityRepository: Pick<CommunityRepository, 'findAll'>;
  createCommunity: UseCase<InputOf<CreateCommunityUseCase>, { id: string }>;
  representativeRepository: Pick<
    CommunityRepresentativeRepository,
    'findByCommunityAndUser'
  >;
  technicianRepository: Pick<
    CommunityTechnicianRepository,
    'findByCommunityAndUser'
  >;
  addRepresentative: UseCase<InputOf<AddRepresentativeUseCase>>;
  addTechnician: UseCase<InputOf<AddTechnicianUseCase>>;
  elementRepository: Pick<
    InspectableElementRepository,
    'findAllByCommunity' | 'findActiveByCommunityAndType'
  >;
  createElement: UseCase<InputOf<CreateInspectableElementUseCase>>;
  questionRepository: Pick<ChecklistQuestionRepository, 'findAll'>;
  createQuestion: UseCase<
    InputOf<CreateChecklistQuestionUseCase>,
    { id: string }
  >;
  templateRepository: Pick<
    ReviewTemplateRepository,
    'findAll' | 'findFrozenWithSnapshot'
  >;
  createDraftTemplate: UseCase<
    InputOf<CreateDraftReviewTemplateUseCase>,
    { id: string }
  >;
  setTemplateQuestions: UseCase<InputOf<SetReviewTemplateQuestionsUseCase>>;
  activateTemplate: UseCase<string>;
  sessionRepository: Pick<
    ReviewSessionRepository,
    | 'findDraftsByPerformer'
    | 'findCompletedForPerformer'
    | 'findByIdForPerformer'
  >;
  openSession: UseCase<OpenReviewSessionInput, { id: string }>;
  recordEntry: {
    execute(
      sessionId: string,
      elementId: string,
      input: RecordEntryInput,
      actor: Actor,
    ): Promise<unknown>;
  };
  completeSession: {
    execute(sessionId: string, actor: Actor): Promise<unknown>;
  };
}

// Works with any Nest context: `INestApplicationContext` (prisma/seed.ts) and
// `TestingModule` (integration spec) both satisfy this structural type.
export function resolveDevSeedDeps(ctx: {
  get<T>(token: unknown): T;
}): DevSeedDeps {
  return {
    companyRepository: ctx.get<MaintenanceCompanyRepository>(
      MAINTENANCE_COMPANY_REPOSITORY,
    ),
    userRepository: ctx.get<UserRepository>(USER_REPOSITORY),
    createCompany: ctx.get(CreateMaintenanceCompanyUseCase),
    createUser: ctx.get(CreateUserUseCase),
    updateUser: ctx.get(UpdateUserUseCase),
    updateProfile: ctx.get(UpdateOrganizationProfileUseCase),
    communityRepository: ctx.get<CommunityRepository>(COMMUNITY_REPOSITORY),
    createCommunity: ctx.get(CreateCommunityUseCase),
    representativeRepository: ctx.get<CommunityRepresentativeRepository>(
      COMMUNITY_REPRESENTATIVE_REPOSITORY,
    ),
    technicianRepository: ctx.get<CommunityTechnicianRepository>(
      COMMUNITY_TECHNICIAN_REPOSITORY,
    ),
    addRepresentative: ctx.get(AddRepresentativeUseCase),
    addTechnician: ctx.get(AddTechnicianUseCase),
    elementRepository: ctx.get<InspectableElementRepository>(
      INSPECTABLE_ELEMENT_REPOSITORY,
    ),
    createElement: ctx.get(CreateInspectableElementUseCase),
    questionRepository: ctx.get<ChecklistQuestionRepository>(
      CHECKLIST_QUESTION_REPOSITORY,
    ),
    createQuestion: ctx.get(CreateChecklistQuestionUseCase),
    templateRepository: ctx.get<ReviewTemplateRepository>(
      REVIEW_TEMPLATE_REPOSITORY,
    ),
    createDraftTemplate: ctx.get(CreateDraftReviewTemplateUseCase),
    setTemplateQuestions: ctx.get(SetReviewTemplateQuestionsUseCase),
    activateTemplate: ctx.get(ActivateReviewTemplateUseCase),
    sessionRepository: ctx.get<ReviewSessionRepository>(
      REVIEW_SESSION_REPOSITORY,
    ),
    openSession: ctx.get(OpenReviewSessionUseCase),
    recordEntry: ctx.get(RecordEntryUseCase),
    completeSession: ctx.get(CompleteReviewSessionUseCase),
  };
}

// A closed gate touches no dependency and only logs the target database host.
export async function runDevSeed(
  nodeEnv: string | undefined,
  databaseHost: string,
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<'seeded' | 'skipped'> {
  if (!shouldSeedDevData(nodeEnv)) {
    const current = nodeEnv === undefined ? 'unset' : `"${nodeEnv}"`;
    log(
      `Skipping dev seed data (technician and dataset): NODE_ENV is ${current}; set NODE_ENV=development in apps/api/.env to seed it. Target database host: ${databaseHost}.`,
    );
    return 'skipped';
  }

  log(`Seeding dev data. Target database host: ${databaseHost}.`);
  await seedDevDataset(deps, data, log);
  return 'seeded';
}

// Additive and idempotent: use cases run only for what is missing.
export async function seedDevDataset(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<TemplateOutcome> {
  await deps.updateProfile.execute(data.profile);
  log('Set the organization profile.');

  const companyIdByTaxId = await seedCompanies(deps, data, log);
  const userIdByEmail = await seedUsers(deps, data, companyIdByTaxId, log);
  const communityIdByName = await seedCommunities(deps, data, log);
  await seedAssignments(deps, data, communityIdByName, userIdByEmail, log);
  await seedElements(deps, data, communityIdByName, log);
  const questionIds = await seedQuestions(deps, data, log);
  const templateKind = await seedTemplate(deps, data, questionIds, log);
  await seedSessions(
    deps,
    data,
    communityIdByName,
    userIdByEmail,
    templateKind,
    log,
  );
  return templateKind;
}

async function seedCompanies(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<Map<string, string>> {
  const existing = await deps.companyRepository.findAll();
  const idByTaxId = new Map<string, string>();

  for (const company of data.companies) {
    const found = findByNaturalKey(existing, (c) => c.taxId, company.taxId);
    if (found) {
      log(`Company ${company.name} already exists, skipping.`);
      idByTaxId.set(company.taxId, found.id);
      continue;
    }
    const created = await deps.createCompany.execute(company);
    log(`Seeded company: ${company.name}`);
    idByTaxId.set(company.taxId, created.id);
  }

  return idByTaxId;
}

async function seedUsers(
  deps: DevSeedDeps,
  data: DevDataset,
  companyIdByTaxId: Map<string, string>,
  log: Log,
): Promise<Map<string, string>> {
  // Usable users only: a blocked one (drifted, or email held) is left out.
  const idByEmail = new Map<string, string>();

  for (const user of data.users) {
    const companyId =
      user.companyTaxId === undefined
        ? null
        : (companyIdByTaxId.get(user.companyTaxId) ?? null);

    const resolved = await resolveUser(deps, data, user, companyId, log);
    if (resolved === null) {
      continue; // blocked: drifted or soft-deleted email
    }
    await grantCapabilities(deps, user, resolved, log);
    idByEmail.set(user.email, resolved.id);
  }

  return idByEmail;
}

type ResolvedUser = Pick<User, 'id' | 'managerCapabilities'>;

// Null when blocked: a drifted row is never repaired, and a soft-deleted
// row holding the email blocks creation.
async function resolveUser(
  deps: DevSeedDeps,
  data: DevDataset,
  user: DevUser,
  companyId: string | null,
  log: Log,
): Promise<ResolvedUser | null> {
  const existing = await deps.userRepository.findByEmail(user.email);

  if (existing) {
    const drift = describeUserDrift(existing, user, companyId);
    if (drift !== null) {
      log(`WARN: user ${user.email} has drifted (${drift}). ${RESET_HINT}`);
      return null;
    }
    log(`User ${user.email} already exists, skipping.`);
    return existing;
  }

  try {
    const created = await deps.createUser.execute({
      email: user.email,
      password: data.password,
      role: user.role,
      ...(companyId !== null && { maintenanceCompanyId: companyId }),
    });
    log(`Seeded user: ${user.email} (${user.role})`);
    return created;
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      log(
        `WARN: email ${user.email} is already in use (likely by a soft-deleted user), so it cannot be seeded. ${RESET_HINT}`,
      );
      return null;
    }
    throw error;
  }
}

// Only the missing capabilities are written, through UpdateUser.
async function grantCapabilities(
  deps: DevSeedDeps,
  user: DevUser,
  resolved: ResolvedUser,
  log: Log,
): Promise<void> {
  const wanted = user.managerCapabilities ?? [];
  const missing = wanted.filter(
    (c) => !resolved.managerCapabilities.includes(c),
  );
  if (missing.length === 0) {
    return;
  }
  await deps.updateUser.execute({
    id: resolved.id,
    managerCapabilities: [...resolved.managerCapabilities, ...missing],
  });
  log(`Granted ${missing.join(', ')} to ${user.email}`);
}

async function seedCommunities(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<Map<string, string>> {
  const existing = await deps.communityRepository.findAll();
  const idByName = new Map<string, string>();

  for (const community of data.communities) {
    const found = findByNaturalKey(existing, (c) => c.name, community.name);
    if (found) {
      log(`Community ${community.name} already exists, skipping.`);
      idByName.set(community.name, found.id);
      continue;
    }
    const created = await deps.createCommunity.execute(community);
    log(`Seeded community: ${community.name}`);
    idByName.set(community.name, created.id);
  }

  return idByName;
}

function requireId(idByName: Map<string, string>, name: string): string {
  const id = idByName.get(name);
  if (id === undefined) {
    throw new Error(`Dev dataset references unknown community "${name}".`);
  }
  return id;
}

// An existing assignment is never reactivated or modified, whatever its state.
async function seedAssignments(
  deps: DevSeedDeps,
  data: DevDataset,
  communityIdByName: Map<string, string>,
  userIdByEmail: Map<string, string>,
  log: Log,
): Promise<void> {
  for (const assignment of data.assignments) {
    const userId = userIdByEmail.get(assignment.userEmail);
    if (userId === undefined) {
      log(
        `WARN: user ${assignment.userEmail} is blocked, so its assignment to ${assignment.communityName} is skipped.`,
      );
      continue;
    }
    const communityId = requireId(communityIdByName, assignment.communityName);
    const isRepresentative = assignment.as === 'REPRESENTATIVE';
    const repository = isRepresentative
      ? deps.representativeRepository
      : deps.technicianRepository;
    const label = `${assignment.as.toLowerCase()} ${assignment.userEmail} of ${assignment.communityName}`;

    if (await repository.findByCommunityAndUser(communityId, userId)) {
      log(`Assignment ${label} already exists, skipping.`);
      continue;
    }
    const add = isRepresentative ? deps.addRepresentative : deps.addTechnician;
    await add.execute({ communityId, userId });
    log(`Seeded assignment: ${label}`);
  }
}

async function seedElements(
  deps: DevSeedDeps,
  data: DevDataset,
  communityIdByName: Map<string, string>,
  log: Log,
): Promise<void> {
  for (const { communityName, ...element } of data.elements) {
    const communityId = requireId(communityIdByName, communityName);
    const existing =
      await deps.elementRepository.findAllByCommunity(communityId);
    if (findByNaturalKey(existing, (e) => e.name, element.name)) {
      log(`Element ${element.name} already exists, skipping.`);
      continue;
    }
    await deps.createElement.execute({ ...element, communityId });
    log(`Seeded element: ${element.name}`);
  }
}

// Ids come back in dataset order, whether created now or already present.
async function seedQuestions(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<string[]> {
  const existing = await deps.questionRepository.findAll();
  // Natural key ignores frequencies on purpose: dataset texts are unique.
  const keyOf = (q: { elementType: string; text: string }) =>
    `${q.elementType}|${q.text}`;
  const ids: string[] = [];

  for (const question of data.questions) {
    const found = findByNaturalKey(existing, keyOf, keyOf(question));
    if (found) {
      log(`Question "${question.text}" already exists, skipping.`);
      ids.push(found.id);
      continue;
    }
    const created = await deps.createQuestion.execute(question);
    log(`Seeded question: ${question.text}`);
    ids.push(created.id);
  }

  return ids;
}

const SKIP_WARNINGS = {
  'skip-foreign-draft': (id: string) =>
    `WARN: draft ${id} is not a seed draft, leaving it untouched.`,
  'skip-unusable-active': (id: string) =>
    `WARN: active template ${id} has no questions, leaving it untouched.`,
};

// The plan kinds, plus the skip a finish-draft attempt can end in at run time.
type TemplateOutcome = TemplatePlan['kind'] | 'skip-unfinishable-draft';

// Returns the outcome kind so callers can tell a usable template from a skip.
async function seedTemplate(
  deps: DevSeedDeps,
  data: DevDataset,
  questionIds: string[],
  log: Log,
): Promise<TemplateOutcome> {
  const { elementType, frequency } = data.template;
  const lineage = (await deps.templateRepository.findAll()).filter(
    (t) => t.elementType === elementType && t.frequency === frequency,
  );
  const active = lineage.find((t) => t.status === 'active');
  const snapshot = active
    ? await deps.templateRepository.findFrozenWithSnapshot(active.id)
    : null;
  const plan = planTemplate(
    lineage,
    active ? (snapshot?.questions.length ?? 0) : null,
  );

  if (plan.kind === 'use-active') {
    log(`Active template ${plan.id} exists, using it.`);
  } else if (plan.kind === 'finish-draft') {
    try {
      await fillAndActivate(deps, plan.id, questionIds);
    } catch (error) {
      if (!isExpectedTemplateError(error)) {
        throw error;
      }
      const { name, message } = error as Error;
      log(
        `WARN: draft ${plan.id} cannot be finished (${name}: ${message}), leaving it untouched.`,
      );
      return 'skip-unfinishable-draft';
    }
    log(`Seeded template: ${data.template.name}`);
  } else if (plan.kind === 'create') {
    const { id } = await deps.createDraftTemplate.execute(data.template);
    await fillAndActivate(deps, id, questionIds);
    log(`Seeded template: ${data.template.name}`);
  } else {
    log(SKIP_WARNINGS[plan.kind](plan.id));
  }
  return plan.kind;
}

async function fillAndActivate(
  deps: DevSeedDeps,
  templateId: string,
  questionIds: string[],
): Promise<void> {
  await deps.setTemplateQuestions.execute({ templateId, questionIds });
  await deps.activateTemplate.execute(templateId);
}

// A domain error from a session (QA changed its preconditions) skips it with
// a warning; anything else is a bug and propagates.
export async function runSessionGuarded(
  label: string,
  log: Log,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!isExpectedSessionError(error)) {
      throw error;
    }
    const { name, message } = error as Error;
    log(`WARN: skipped ${label}: ${name}: ${message}`);
  }
}

async function seedSessions(
  deps: DevSeedDeps,
  data: DevDataset,
  communityIdByName: Map<string, string>,
  userIdByEmail: Map<string, string>,
  templateKind: TemplateOutcome,
  log: Log,
): Promise<void> {
  for (const session of data.sessions) {
    const { performerEmail, communityName } = session;
    const where = `${performerEmail} in ${communityName}`;
    const performerId = userIdByEmail.get(performerEmail);
    if (performerId === undefined) {
      log(
        `WARN: user ${performerEmail} is blocked, so its session in ${communityName} is skipped.`,
      );
      continue;
    }
    const communityId = requireId(communityIdByName, communityName);
    const plan = planSession(
      communityId,
      await deps.sessionRepository.findCompletedForPerformer(performerId),
      await deps.sessionRepository.findDraftsByPerformer(performerId),
    );

    if (plan.kind === 'skip') {
      log(`Session of ${where} already exists, skipping.`);
      continue;
    }
    // Only a new session needs the template; a resumed draft has its own.
    if (plan.kind === 'open' && templateKind.startsWith('skip-')) {
      log(
        `WARN: no usable template (${templateKind}), so the new session of ${where} is skipped.`,
      );
      continue;
    }
    const role = data.users.find((u) => u.email === performerEmail)!.role;
    await runSessionGuarded(
      `${plan.kind} session of ${where}`,
      log,
      async () => {
        const changed = await playSession(
          deps,
          data,
          session,
          plan,
          communityId,
          { userId: performerId, role },
        );
        log(
          changed
            ? `Seeded session: ${where}`
            : `Session of ${where} already exists, skipping.`,
        );
      },
    );
  }
}

// Records the planned entries the session lacks, then completes it when the
// plan says so. Existing entries (including QA edits) are never rewritten.
// Returns whether anything was written.
async function playSession(
  deps: DevSeedDeps,
  data: DevDataset,
  session: DevSession,
  plan: Exclude<SessionPlan, { kind: 'skip' }>,
  communityId: string,
  actor: Actor,
): Promise<boolean> {
  let sessionId: string;
  let templateId: string;
  const covered = new Set<string>();
  let changed = plan.kind === 'open';

  if (plan.kind === 'open') {
    const { elementType, frequency } = data.template;
    const active = (await deps.templateRepository.findAll()).find(
      (t) =>
        t.status === 'active' &&
        t.elementType === elementType &&
        t.frequency === frequency,
    );
    if (!active) {
      throw new ActiveTemplateNotFoundError();
    }
    templateId = active.id;
    sessionId = (
      await deps.openSession.execute({
        communityId,
        templateId,
        performedById: actor.userId,
        role: actor.role,
      })
    ).id;
  } else {
    const draft = await deps.sessionRepository.findByIdForPerformer(
      plan.sessionId,
      actor.userId,
    );
    if (!draft) {
      throw new ReviewSessionNotFoundError();
    }
    sessionId = draft.id;
    templateId = draft.templateId;
    draft.entries.forEach((e) => covered.add(e.inspectableElementId));
  }

  const snapshot =
    await deps.templateRepository.findFrozenWithSnapshot(templateId);
  // An empty snapshot would fail later with an unexpected MissingAnswersError.
  if (!snapshot || snapshot.questions.length === 0) {
    throw new ActiveTemplateNotFoundError();
  }
  const questionIds = snapshot.questions.map((q) => q.questionId);
  const record = async (elementId: string, input: RecordEntryInput) => {
    await deps.recordEntry.execute(sessionId, elementId, input, actor);
    covered.add(elementId);
    changed = true;
  };

  const elements = await deps.elementRepository.findAllByCommunity(communityId);
  for (const entry of session.entries) {
    const element = findByNaturalKey(
      elements,
      (e) => e.name,
      entry.elementName,
    );
    if (!element) {
      throw new InspectableElementNotFoundError();
    }
    if (!covered.has(element.id)) {
      await record(element.id, toEntryInput(entry.outcome, questionIds));
    }
  }

  if (!session.complete) {
    return changed;
  }
  // Complete rejects uncovered active elements, e.g. one QA added.
  const active = await deps.elementRepository.findActiveByCommunityAndType(
    communityId,
    snapshot.elementType,
  );
  for (const element of active) {
    if (!covered.has(element.id)) {
      await record(element.id, toEntryInput('YES', questionIds));
    }
  }
  await deps.completeSession.execute(sessionId, actor);
  return true;
}

function toEntryInput(
  outcome: DevSessionEntry['outcome'],
  questionIds: string[],
): RecordEntryInput {
  if (outcome === 'UNREVIEWED') {
    return { kind: 'unreviewed', observations: 'Not reviewed: no access.' };
  }
  return {
    kind: 'reviewed',
    answers: questionIds.map((questionId, i) => ({
      questionId,
      value: outcome === 'NO' && i === 0 ? 'NO' : 'YES',
    })),
  };
}
