import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  createInspectableElementSchema,
  elementTypeSchema,
  type ElementType,
} from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createInspectableElement } from '../api/inspectable-element';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../inspectable-element/error-messages';

const ELEMENT_TYPE_OPTIONS = elementTypeSchema.options;
const DEFAULT_ELEMENT_TYPE: ElementType = ELEMENT_TYPE_OPTIONS[0];

// spec.md "Create Inspectable Element": client-side validation against the
// shared createInspectableElementSchema MUST run before any network request
// (ADR-015 single source of truth, mirrors MaintenanceCompanyCreatePage.tsx's
// pattern). On success the caller is sent back to this community's elements
// list, which refetches on mount — "appears in the list without a manual
// reload" per the spec. Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "No Server-Message String Coupling"); this
// page never reads ApiError.message. The elementType <select> renders its
// options through mapElementTypeToLabelKey (spec "Element Type Label
// Mapping") — the raw enum value only backs <option value>. `installedAt`
// uses a native date input, whose value is already the 'YYYY-MM-DD' shape
// the shared schema expects (design.md Decision 3) — no conversion needed.
export function InspectableElementCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { communityId } = useParams<{ communityId: string }>();
  const [elementType, setElementType] = useState<ElementType>(DEFAULT_ELEMENT_TYPE);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [installedAt, setInstalledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Empty optional fields become `undefined` rather than an empty string,
    // which the shared schema's `.min(1)` would otherwise reject —
    // description/serialNumber are genuinely optional on create (spec
    // "Create Inspectable Element").
    const result = createInspectableElementSchema.safeParse({
      elementType,
      name,
      description: description.trim() === '' ? undefined : description,
      location,
      serialNumber: serialNumber.trim() === '' ? undefined : serialNumber,
      installedAt,
    });
    if (!result.success) {
      setError(t('inspectableElement.create.validationError'));
      return;
    }

    if (communityId === undefined) {
      setError(t('inspectableElement.error.notFound'));
      return;
    }

    setSubmitting(true);
    try {
      await createInspectableElement(communityId, result.data);
      navigate(`/communities/${communityId}/inspectable-elements`);
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t('inspectableElement.create.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="inspectable-element-create-type-input">
          {t('inspectableElement.create.typeLabel')}
        </label>
        <select
          id="inspectable-element-create-type-input"
          value={elementType}
          onChange={(event) => setElementType(event.target.value as ElementType)}
          data-testid="inspectable-element-create-type"
        >
          {ELEMENT_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapElementTypeToLabelKey(option))}
            </option>
          ))}
        </select>
        <label htmlFor="inspectable-element-create-name-input">
          {t('inspectableElement.create.nameLabel')}
        </label>
        <input
          id="inspectable-element-create-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="inspectable-element-create-name"
        />
        <label htmlFor="inspectable-element-create-description-input">
          {t('inspectableElement.create.descriptionLabel')}
        </label>
        <input
          id="inspectable-element-create-description-input"
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="inspectable-element-create-description"
        />
        <label htmlFor="inspectable-element-create-location-input">
          {t('inspectableElement.create.locationLabel')}
        </label>
        <input
          id="inspectable-element-create-location-input"
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          data-testid="inspectable-element-create-location"
        />
        <label htmlFor="inspectable-element-create-serial-number-input">
          {t('inspectableElement.create.serialNumberLabel')}
        </label>
        <input
          id="inspectable-element-create-serial-number-input"
          type="text"
          value={serialNumber}
          onChange={(event) => setSerialNumber(event.target.value)}
          data-testid="inspectable-element-create-serial-number"
        />
        <label htmlFor="inspectable-element-create-installed-at-input">
          {t('inspectableElement.create.installedAtLabel')}
        </label>
        <input
          id="inspectable-element-create-installed-at-input"
          type="date"
          value={installedAt}
          onChange={(event) => setInstalledAt(event.target.value)}
          data-testid="inspectable-element-create-installed-at"
        />
        {error && <p data-testid="inspectable-element-create-error">{error}</p>}
        <button
          type="submit"
          data-testid="inspectable-element-create-submit"
          disabled={submitting}
        >
          {t('inspectableElement.create.submitLabel')}
        </button>
      </form>
    </main>
  );
}
