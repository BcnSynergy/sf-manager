import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  createChecklistQuestionSchema,
  elementTypeSchema,
  reviewFrequencySchema,
  type ElementType,
  type ReviewFrequency,
} from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { createChecklistQuestion } from '../api/checklist-question';
import { mapApiErrorToMessageKey } from '../checklist-question/error-messages';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';

const ELEMENT_TYPE_OPTIONS = elementTypeSchema.options;
const DEFAULT_ELEMENT_TYPE: ElementType = ELEMENT_TYPE_OPTIONS[0];
const REVIEW_FREQUENCY_OPTIONS = reviewFrequencySchema.options;

// spec.md "Create Checklist Question": client-side validation against the
// shared createChecklistQuestionSchema MUST run before any network request,
// including rejection of an empty frequency selection (ADR-015 single
// source of truth, mirrors InspectableElementCreatePage.tsx's pattern). On
// success the caller is sent back to the pool list, which refetches on
// mount — "appears in the list without a manual reload" per the spec.
// Server-side rejection is mapped exclusively through
// mapApiErrorToMessageKey (spec "Coded Error Handling Without
// Server-Message Coupling"); this page never reads ApiError.message. The
// elementType <select> and the frequency checkboxes render through their
// label maps (spec "Element Type and Frequency Label Mapping") — the raw
// enum values only back <option>/<input value>.
export function ChecklistQuestionCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [elementType, setElementType] = useState<ElementType>(DEFAULT_ELEMENT_TYPE);
  const [frequencies, setFrequencies] = useState<ReviewFrequency[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleFrequency(frequency: ReviewFrequency) {
    setFrequencies((current) =>
      current.includes(frequency)
        ? current.filter((candidate) => candidate !== frequency)
        : [...current, frequency],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = createChecklistQuestionSchema.safeParse({
      elementType,
      frequencies,
      text,
    });
    if (!result.success) {
      setError(t('checklistQuestion.create.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      await createChecklistQuestion(result.data);
      navigate('/checklist-questions');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>{t('checklistQuestion.create.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="checklist-question-create-type-input">
          {t('checklistQuestion.create.typeLabel')}
        </label>
        <select
          id="checklist-question-create-type-input"
          value={elementType}
          onChange={(event) => setElementType(event.target.value as ElementType)}
          data-testid="checklist-question-create-type"
        >
          {ELEMENT_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(mapElementTypeToLabelKey(option))}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>{t('checklistQuestion.create.frequenciesLabel')}</legend>
          {REVIEW_FREQUENCY_OPTIONS.map((option) => (
            <label key={option} htmlFor={`checklist-question-create-frequency-${option}`}>
              <input
                id={`checklist-question-create-frequency-${option}`}
                type="checkbox"
                value={option}
                checked={frequencies.includes(option)}
                onChange={() => toggleFrequency(option)}
                data-testid={`checklist-question-create-frequency-${option}`}
              />
              {t(mapReviewFrequencyToLabelKey(option))}
            </label>
          ))}
        </fieldset>
        <label htmlFor="checklist-question-create-text-input">
          {t('checklistQuestion.create.textLabel')}
        </label>
        <textarea
          id="checklist-question-create-text-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          data-testid="checklist-question-create-text"
        />
        {error && <p data-testid="checklist-question-create-error">{error}</p>}
        <button
          type="submit"
          data-testid="checklist-question-create-submit"
          disabled={submitting}
        >
          {t('checklistQuestion.create.submitLabel')}
        </button>
      </form>
    </main>
  );
}
