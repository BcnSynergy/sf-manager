import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  createDraftReviewTemplateSchema,
  elementTypeSchema,
  reviewFrequencySchema,
  type ElementType,
  type ReviewFrequency,
} from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createDraftReviewTemplate } from '../api/review-template';
import { mapApiErrorToMessageKey } from '../review-template/error-messages';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';

// `elementTypeSchema.options` currently resolves to a single value
// (`EXTINGUISHER` — the only ElementType in the system today). This is
// still rendered as a <select> rather than a fixed/pre-selected value:
// ChecklistQuestionCreatePage.tsx (PR5, this change's own sibling module)
// already established the <select>-over-N-options pattern for the exact
// same closed catalog, and a second, divergent rendering here (e.g. a
// hidden fixed value) would be an unrequested inconsistency, not a
// simplification — ADR-006 governs SCOPE (build only what's needed), not
// stylistic divergence from an already-shipped, already-reviewed sibling
// page rendering the identical type.
const ELEMENT_TYPE_OPTIONS = elementTypeSchema.options;
const DEFAULT_ELEMENT_TYPE: ElementType = ELEMENT_TYPE_OPTIONS[0];
const REVIEW_FREQUENCY_OPTIONS = reviewFrequencySchema.options;
const DEFAULT_FREQUENCY: ReviewFrequency = REVIEW_FREQUENCY_OPTIONS[0];

// spec.md "Create Draft Template": client-side validation against the
// shared createDraftReviewTemplateSchema MUST run before any network
// request (ADR-015 single source of truth, mirrors
// ChecklistQuestionCreatePage.tsx's pattern). On success the caller is
// sent back to the templates list, which refetches on mount — "reachable
// without a manual reload" per the spec. A 409 REVIEW_TEMPLATE_DRAFT_EXISTS
// rejection is surfaced through mapApiErrorToMessageKey as a specific
// message naming that cause (spec "Existing draft conflict is explained,
// not generic") — this page never reads ApiError.message.
export function ReviewTemplateCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [elementType, setElementType] = useState<ElementType>(DEFAULT_ELEMENT_TYPE);
  const [frequency, setFrequency] = useState<ReviewFrequency>(DEFAULT_FREQUENCY);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = createDraftReviewTemplateSchema.safeParse({
      elementType,
      frequency,
      name,
    });
    if (!result.success) {
      setError(t('reviewTemplate.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createDraftReviewTemplate(result.data);
      navigate('/review-templates');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t('reviewTemplate.create.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="review-template-create-type-input">
          {t('reviewTemplate.create.typeLabel')}
        </label>
        <select
          id="review-template-create-type-input"
          value={elementType}
          onChange={(event) => setElementType(event.target.value as ElementType)}
          data-testid="review-template-create-type"
        >
          {ELEMENT_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapElementTypeToLabelKey(option))}
            </option>
          ))}
        </select>
        <label htmlFor="review-template-create-frequency-input">
          {t('reviewTemplate.create.frequencyLabel')}
        </label>
        <select
          id="review-template-create-frequency-input"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value as ReviewFrequency)}
          data-testid="review-template-create-frequency"
        >
          {REVIEW_FREQUENCY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapReviewFrequencyToLabelKey(option))}
            </option>
          ))}
        </select>
        <label htmlFor="review-template-create-name-input">
          {t('reviewTemplate.create.nameLabel')}
        </label>
        <input
          id="review-template-create-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="review-template-create-name"
        />
        {error && <p data-testid="review-template-create-error">{error}</p>}
        <button type="submit" data-testid="review-template-create-submit" disabled={submitting}>
          {t('reviewTemplate.create.submitLabel')}
        </button>
      </form>
    </main>
  );
}
