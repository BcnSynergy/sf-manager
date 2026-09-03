import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import es from './locales/es.json';
import ca from './locales/ca.json';

// Structural i18n parity guard (spec "Internationalization Coverage",
// design.md Testing Strategy: "Key-set equality test over the 3 locale
// JSONs"). This does NOT check translation quality/content — only that the
// three locale files expose the identical set of nested key paths, so a key
// added to `en.json` in one PR can never silently ship without its `es`/`ca`
// counterpart.

type LocaleTree = { [key: string]: string | LocaleTree };

function collectKeyPaths(tree: LocaleTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      return [path];
    }
    return collectKeyPaths(value, path);
  });
}

describe('locale key-set parity (en/es/ca)', () => {
  const locales: Record<string, LocaleTree> = {
    en: en as LocaleTree,
    es: es as LocaleTree,
    ca: ca as LocaleTree,
  };

  const keyPathsByLocale = Object.fromEntries(
    Object.entries(locales).map(([name, tree]) => [name, new Set(collectKeyPaths(tree))]),
  );

  it('en and es expose the same nested key paths', () => {
    const missingFromEs = [...keyPathsByLocale.en].filter((k) => !keyPathsByLocale.es.has(k));
    const extraInEs = [...keyPathsByLocale.es].filter((k) => !keyPathsByLocale.en.has(k));

    expect(missingFromEs).toEqual([]);
    expect(extraInEs).toEqual([]);
  });

  it('en and ca expose the same nested key paths', () => {
    const missingFromCa = [...keyPathsByLocale.en].filter((k) => !keyPathsByLocale.ca.has(k));
    const extraInCa = [...keyPathsByLocale.ca].filter((k) => !keyPathsByLocale.en.has(k));

    expect(missingFromCa).toEqual([]);
    expect(extraInCa).toEqual([]);
  });

  it('no locale is missing any key path present in another locale', () => {
    const allKeyPaths = new Set([
      ...keyPathsByLocale.en,
      ...keyPathsByLocale.es,
      ...keyPathsByLocale.ca,
    ]);

    for (const [localeName, keyPaths] of Object.entries(keyPathsByLocale)) {
      const missing = [...allKeyPaths].filter((k) => !keyPaths.has(k));
      expect(missing, `${localeName} is missing key paths: ${missing.join(', ')}`).toEqual([]);
    }
  });

  // Existence guard (community-minimal-ui PR8, task 8.1). The parity checks
  // above only prove the 3 locale files agree with EACH OTHER — they cannot
  // catch a key that is referenced by application code but absent from ALL
  // THREE locales at once (exactly what happened to `community.error.*`
  // across PR2/PR3: error-messages.ts referenced the keys, but none of the
  // 3 locale JSONs ever defined them, so cross-locale parity held trivially
  // while every one of those keys rendered as a raw i18next fallback key
  // instead of translated text). This is a fixed, hand-maintained list of
  // every `community.*` key path referenced by source across PR1-PR8 —
  // independent of what the locale files currently contain — so a future
  // PR that adds a new call site without adding its translation fails here.
  const REQUIRED_COMMUNITY_KEY_PATHS = [
    // list (Phase 4/5/6/7)
    'community.list.title',
    'community.list.loading',
    'community.list.empty',
    'community.list.columnName',
    'community.list.columnAddress',
    'community.list.columnLocale',
    'community.list.delete',
    'community.list.deleteConfirmTitle',
    'community.list.deleteConfirmMessage',
    'community.list.createLink',
    'community.list.editLink',
    'community.list.viewLink',
    // locale label map (Phase 4)
    'community.locale.en',
    'community.locale.es',
    'community.locale.ca',
    // assignment status label map (Phase 3)
    'community.assignment.status.active',
    'community.assignment.status.deactivated',
    // create (Phase 5)
    'community.create.title',
    'community.create.nameLabel',
    'community.create.addressLabel',
    'community.create.localeLabel',
    'community.create.submitLabel',
    'community.create.validationError',
    // edit (Phase 6)
    'community.edit.title',
    'community.edit.nameLabel',
    'community.edit.addressLabel',
    'community.edit.localeLabel',
    'community.edit.submitLabel',
    'community.edit.validationError',
    'community.edit.notFound',
    // detail (Phase 7)
    'community.detail.title',
    'community.detail.nameLabel',
    'community.detail.addressLabel',
    'community.detail.localeLabel',
    'community.detail.notFound',
    // detail nav-link to inspectable elements (Phase 9)
    'community.detail.elementsLink',
    // representatives / technicians AssignmentSection keys (Phase 7)
    'community.representatives.title',
    'community.representatives.empty',
    'community.representatives.assignLabel',
    'community.representatives.confirmTitle',
    'community.representatives.confirmMessage',
    'community.representatives.ineligible',
    'community.technicians.title',
    'community.technicians.empty',
    'community.technicians.assignLabel',
    'community.technicians.confirmTitle',
    'community.technicians.confirmMessage',
    'community.technicians.ineligible',
    // error-messages.ts mapping targets (Phase 2, closed in PR8)
    'community.error.assignmentExists',
    'community.error.ineligibleRole',
    'community.error.tryAgain',
    'community.error.validationFailed',
    'community.error.assignmentTargetNotFound',
  ];

  // Existence guard for maintenance-company (Phase 9), same rationale as
  // REQUIRED_COMMUNITY_KEY_PATHS above — a fixed, hand-maintained list of
  // every `maintenanceCompany.*` key path referenced by source in PR9, so a
  // future PR that adds a new call site without adding its translation
  // fails here rather than silently rendering the raw key.
  const REQUIRED_MAINTENANCE_COMPANY_KEY_PATHS = [
    // list (Phase 9)
    'maintenanceCompany.list.title',
    'maintenanceCompany.list.loading',
    'maintenanceCompany.list.empty',
    'maintenanceCompany.list.columnName',
    'maintenanceCompany.list.columnTaxId',
    'maintenanceCompany.list.columnContactInfo',
    'maintenanceCompany.list.createLink',
    'maintenanceCompany.list.editLink',
    // create (Phase 9)
    'maintenanceCompany.create.title',
    'maintenanceCompany.create.nameLabel',
    'maintenanceCompany.create.taxIdLabel',
    'maintenanceCompany.create.contactInfoLabel',
    'maintenanceCompany.create.submitLabel',
    'maintenanceCompany.create.validationError',
    // edit (Phase 10)
    'maintenanceCompany.edit.title',
    'maintenanceCompany.edit.nameLabel',
    'maintenanceCompany.edit.taxIdLabel',
    'maintenanceCompany.edit.contactInfoLabel',
    'maintenanceCompany.edit.submitLabel',
    'maintenanceCompany.edit.validationError',
    'maintenanceCompany.edit.notFound',
    'maintenanceCompany.edit.deleteLabel',
    'maintenanceCompany.edit.deleteConfirmTitle',
    'maintenanceCompany.edit.deleteConfirmMessage',
    // error-messages.ts mapping targets (Phase 9)
    'maintenanceCompany.error.duplicateTaxId',
    'maintenanceCompany.error.hasActiveUsers',
    'maintenanceCompany.error.validationFailed',
    'maintenanceCompany.error.notFound',
    // id -> name resolution fallback (design.md Decision 7, used from
    // Phase 11 onward, defined now so the key exists before it is consumed)
    'maintenanceCompany.unknown',
  ];

  // Existence guard for the users-side maintenance-company additions
  // (Phase 11), same rationale as REQUIRED_COMMUNITY_KEY_PATHS /
  // REQUIRED_MAINTENANCE_COMPANY_KEY_PATHS above.
  const REQUIRED_USER_MAINTENANCE_COMPANY_KEY_PATHS = [
    // list column (Phase 11)
    'users.list.columnCompany',
    // create/edit company selector (Phase 11)
    'users.create.companyLabel',
    'users.create.companyPlaceholder',
    'users.edit.companyLabel',
    'users.edit.companyPlaceholder',
    // error-messages.ts mapping targets (Phase 11)
    'users.error.maintenanceCompanyRequired',
    'users.error.maintenanceCompanyNotAllowed',
    'users.error.maintenanceCompanyNotFound',
  ];

  // Existence guard for inspectable-element (Phase 7), same rationale as
  // REQUIRED_COMMUNITY_KEY_PATHS above — a fixed, hand-maintained list of
  // every `inspectableElement.*` key path referenced by source in PR7, so a
  // future PR that adds a new call site without adding its translation
  // fails here rather than silently rendering the raw key.
  const REQUIRED_INSPECTABLE_ELEMENT_KEY_PATHS = [
    // list (Phase 7)
    'inspectableElement.list.title',
    'inspectableElement.list.loading',
    'inspectableElement.list.empty',
    'inspectableElement.list.columnType',
    'inspectableElement.list.columnName',
    'inspectableElement.list.columnDescription',
    'inspectableElement.list.columnLocation',
    'inspectableElement.list.columnSerialNumber',
    'inspectableElement.list.columnInstalledAt',
    'inspectableElement.list.createLink',
    // create (Phase 7)
    'inspectableElement.create.title',
    'inspectableElement.create.typeLabel',
    'inspectableElement.create.nameLabel',
    'inspectableElement.create.descriptionLabel',
    'inspectableElement.create.locationLabel',
    'inspectableElement.create.serialNumberLabel',
    'inspectableElement.create.installedAtLabel',
    'inspectableElement.create.submitLabel',
    'inspectableElement.create.validationError',
    // error-messages.ts mapping targets (Phase 7)
    'inspectableElement.error.validationFailed',
    'inspectableElement.error.notFound',
    // element-type-labels.ts mapping targets (Phase 7)
    'inspectableElement.type.extinguisher',
    // edit (Phase 8)
    'inspectableElement.edit.title',
    'inspectableElement.edit.typeLabel',
    'inspectableElement.edit.nameLabel',
    'inspectableElement.edit.descriptionLabel',
    'inspectableElement.edit.locationLabel',
    'inspectableElement.edit.serialNumberLabel',
    'inspectableElement.edit.installedAtLabel',
    'inspectableElement.edit.submitLabel',
    'inspectableElement.edit.validationError',
    'inspectableElement.edit.notFound',
    'inspectableElement.edit.deleteLabel',
    'inspectableElement.edit.deleteConfirmTitle',
    'inspectableElement.edit.deleteConfirmMessage',
  ];

  // Existence guard for checklist-question (Phase 5), same rationale as
  // REQUIRED_COMMUNITY_KEY_PATHS above — a fixed, hand-maintained list of
  // every `checklistQuestion.*` key path referenced by source in PR5, so a
  // future PR that adds a new call site without adding its translation
  // fails here rather than silently rendering the raw key.
  const REQUIRED_CHECKLIST_QUESTION_KEY_PATHS = [
    // list (Phase 5)
    'checklistQuestion.list.title',
    'checklistQuestion.list.loading',
    'checklistQuestion.list.empty',
    'checklistQuestion.list.columnText',
    'checklistQuestion.list.columnFrequencies',
    'checklistQuestion.list.columnActions',
    'checklistQuestion.list.createLink',
    'checklistQuestion.list.editLink',
    'checklistQuestion.list.delete',
    'checklistQuestion.list.deleteConfirmTitle',
    'checklistQuestion.list.deleteConfirmMessage',
    // create (Phase 5)
    'checklistQuestion.create.title',
    'checklistQuestion.create.typeLabel',
    'checklistQuestion.create.frequenciesLabel',
    'checklistQuestion.create.textLabel',
    'checklistQuestion.create.submitLabel',
    'checklistQuestion.create.validationError',
    // edit (Phase 5)
    'checklistQuestion.edit.title',
    'checklistQuestion.edit.typeLabel',
    'checklistQuestion.edit.frequenciesLabel',
    'checklistQuestion.edit.textLabel',
    'checklistQuestion.edit.submitLabel',
    'checklistQuestion.edit.validationError',
    'checklistQuestion.edit.notFound',
    'checklistQuestion.edit.deleteLabel',
    'checklistQuestion.edit.deleteConfirmTitle',
    'checklistQuestion.edit.deleteConfirmMessage',
    // error-messages.ts mapping targets (Phase 5)
    'checklistQuestion.error.validationFailed',
    'checklistQuestion.error.notFound',
    // review-frequency-labels.ts mapping targets (Phase 5)
    'checklistQuestion.frequency.monthly',
    'checklistQuestion.frequency.quarterly',
    'checklistQuestion.frequency.semiannual',
    'checklistQuestion.frequency.annual',
  ];

  function getKeyPathValue(tree: LocaleTree, path: string): string | LocaleTree | undefined {
    return path.split('.').reduce<string | LocaleTree | undefined>((node, segment) => {
      if (node === undefined || typeof node === 'string') {
        return undefined;
      }
      return node[segment];
    }, tree);
  }

  it.each(REQUIRED_COMMUNITY_KEY_PATHS)(
    'every locale defines a real (non-placeholder) value for %s',
    (keyPath) => {
      for (const [localeName, tree] of Object.entries(locales)) {
        const value = getKeyPathValue(tree, keyPath);
        expect(value, `${localeName} is missing "${keyPath}"`).toBeTypeOf('string');
        expect((value as string).length, `${localeName}."${keyPath}" is empty`).toBeGreaterThan(0);
        expect(value, `${localeName}."${keyPath}" looks like a placeholder (equals its own key path)`).not.toBe(
          keyPath,
        );
      }
    },
  );

  it.each(REQUIRED_MAINTENANCE_COMPANY_KEY_PATHS)(
    'every locale defines a real (non-placeholder) value for %s',
    (keyPath) => {
      for (const [localeName, tree] of Object.entries(locales)) {
        const value = getKeyPathValue(tree, keyPath);
        expect(value, `${localeName} is missing "${keyPath}"`).toBeTypeOf('string');
        expect((value as string).length, `${localeName}."${keyPath}" is empty`).toBeGreaterThan(0);
        expect(value, `${localeName}."${keyPath}" looks like a placeholder (equals its own key path)`).not.toBe(
          keyPath,
        );
      }
    },
  );

  it.each(REQUIRED_USER_MAINTENANCE_COMPANY_KEY_PATHS)(
    'every locale defines a real (non-placeholder) value for %s',
    (keyPath) => {
      for (const [localeName, tree] of Object.entries(locales)) {
        const value = getKeyPathValue(tree, keyPath);
        expect(value, `${localeName} is missing "${keyPath}"`).toBeTypeOf('string');
        expect((value as string).length, `${localeName}."${keyPath}" is empty`).toBeGreaterThan(0);
        expect(value, `${localeName}."${keyPath}" looks like a placeholder (equals its own key path)`).not.toBe(
          keyPath,
        );
      }
    },
  );

  it.each(REQUIRED_INSPECTABLE_ELEMENT_KEY_PATHS)(
    'every locale defines a real (non-placeholder) value for %s',
    (keyPath) => {
      for (const [localeName, tree] of Object.entries(locales)) {
        const value = getKeyPathValue(tree, keyPath);
        expect(value, `${localeName} is missing "${keyPath}"`).toBeTypeOf('string');
        expect((value as string).length, `${localeName}."${keyPath}" is empty`).toBeGreaterThan(0);
        expect(value, `${localeName}."${keyPath}" looks like a placeholder (equals its own key path)`).not.toBe(
          keyPath,
        );
      }
    },
  );

  it.each(REQUIRED_CHECKLIST_QUESTION_KEY_PATHS)(
    'every locale defines a real (non-placeholder) value for %s',
    (keyPath) => {
      for (const [localeName, tree] of Object.entries(locales)) {
        const value = getKeyPathValue(tree, keyPath);
        expect(value, `${localeName} is missing "${keyPath}"`).toBeTypeOf('string');
        expect((value as string).length, `${localeName}."${keyPath}" is empty`).toBeGreaterThan(0);
        expect(value, `${localeName}."${keyPath}" looks like a placeholder (equals its own key path)`).not.toBe(
          keyPath,
        );
      }
    },
  );
});
