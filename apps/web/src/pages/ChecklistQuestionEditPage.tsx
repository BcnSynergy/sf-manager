import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  reviewFrequencySchema,
  updateChecklistQuestionSchema,
  type ElementType,
  type ReviewFrequency,
} from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  listChecklistQuestions,
  softDeleteChecklistQuestion,
  updateChecklistQuestion,
} from '../api/checklist-question';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageHeader } from '../components/PageHeader';
import { mapApiErrorToMessageKey } from '../checklist-question/error-messages';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';

const REVIEW_FREQUENCY_OPTIONS = reviewFrequencySchema.options;

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// spec.md "Edit Checklist Question" / "Confirmed Soft-Delete". No
// `GET /checklist-questions/:id` exists (design.md Decision 8, Interfaces)
// — this is the only caller that needs to resolve :questionId, so the
// list-and-select is inlined here rather than extracted into a shared
// hook, mirroring InspectableElementEditPage.tsx's single-caller
// precedent. Load states are the same four as that page: loading | loaded
// | not-found | error.
//
// `elementType` is NOT editable (design.md Interfaces,
// ChecklistQuestionRepository.updateById comment) — the form renders the
// type as read-only text through the label map, never as an editable
// control, and never sends it in the update payload.
//
// The synchronous "params missing" guard sets state from inside a
// `Promise.resolve().then(...)` continuation rather than directly in the
// effect body — otherwise `react-hooks/set-state-in-effect` fires (mirrors
// InspectableElementEditPage.tsx's identical guard).
export function ChecklistQuestionEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { questionId } = useParams<{ questionId: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [elementType, setElementType] = useState<ElementType | null>(null);
  const [text, setText] = useState('');
  const [frequencies, setFrequencies] = useState<ReviewFrequency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (questionId === undefined) {
      // Every setState call must live inside a promise continuation, even
      // on this synchronous guard clause — otherwise the react-hooks "no
      // setState directly in an effect" rule fires (mirrors
      // ChecklistQuestionEditPage's own not-found path below and
      // InspectableElementEditPage.tsx's identical guard).
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });
      return;
    }

    listChecklistQuestions()
      .then((questions) => {
        if (cancelled) {
          return;
        }
        const found = questions.find((candidate) => candidate.id === questionId);
        if (!found) {
          setLoadState('not-found');
          return;
        }
        setElementType(found.elementType);
        setText(found.text);
        setFrequencies(found.frequencies);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [questionId]);

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

    const result = updateChecklistQuestionSchema.safeParse({ text, frequencies });
    if (!result.success) {
      setError(t('checklistQuestion.edit.validationError'));
      return;
    }

    if (questionId === undefined) {
      return;
    }

    setSubmitting(true);
    try {
      await updateChecklistQuestion(questionId, result.data);
      navigate('/checklist-questions');
    } catch (caughtError) {
      setError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  function requestDelete() {
    setDeleteError(null);
    setPendingDelete(true);
  }

  async function confirmDelete() {
    setPendingDelete(false);
    if (questionId === undefined) {
      return;
    }

    setDeleting(true);
    try {
      await softDeleteChecklistQuestion(questionId);
      navigate('/checklist-questions');
    } catch (caughtError) {
      setDeleteError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setDeleting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('checklistQuestion.edit.title')} />
        <p className="sf-empty" data-testid="checklist-question-edit-loading">
          {t('checklistQuestion.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <PageHeader title={t('checklistQuestion.edit.title')} />
        <p className="sf-empty" data-testid="checklist-question-edit-not-found">
          {t('checklistQuestion.edit.notFound')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <PageHeader title={t('checklistQuestion.edit.title')} />
        <p className="sf-empty" data-testid="checklist-question-edit-error-state">
          {t('common.error.network')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('checklistQuestion.edit.title')} />
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form className="sf-form" onSubmit={handleSubmit} noValidate>
        <p>
          {t('checklistQuestion.edit.typeLabel')}:{' '}
          <span data-testid="checklist-question-edit-type">
            {elementType !== null ? t(mapElementTypeToLabelKey(elementType)) : ''}
          </span>
        </p>
        <fieldset className="sf-field">
          <legend>{t('checklistQuestion.edit.frequenciesLabel')}</legend>
          {REVIEW_FREQUENCY_OPTIONS.map((option) => (
            <label
              key={option}
              className="sf-choice"
              htmlFor={`checklist-question-edit-frequency-${option}`}
            >
              <input
                id={`checklist-question-edit-frequency-${option}`}
                type="checkbox"
                value={option}
                checked={frequencies.includes(option)}
                onChange={() => toggleFrequency(option)}
                data-testid={`checklist-question-edit-frequency-${option}`}
              />
              {t(mapReviewFrequencyToLabelKey(option))}
            </label>
          ))}
        </fieldset>
        <div className="sf-field">
          <label htmlFor="checklist-question-edit-text-input">
            {t('checklistQuestion.edit.textLabel')}
          </label>
          <textarea
            id="checklist-question-edit-text-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            data-testid="checklist-question-edit-text"
          />
        </div>
        {error && (
          <div
            className="sf-alert sf-alert-danger"
            role="alert"
            data-testid="checklist-question-edit-error"
          >
            <span className="sf-alert-icon" aria-hidden="true">
              !
            </span>
            <p>{error}</p>
          </div>
        )}
        <div className="sf-actions">
          <button
            type="submit"
            className="sf-btn sf-btn-primary"
            data-testid="checklist-question-edit-submit"
            disabled={submitting || deleting}
          >
            {t('checklistQuestion.edit.submitLabel')}
          </button>
        </div>
      </form>
      {/* EN-74: the page actions follow the form, so the fields come first in
          tab order; their failures show just above them. */}
      {deleteError && (
        <div
          className="sf-alert sf-alert-danger"
          role="alert"
          data-testid="checklist-question-edit-delete-error"
        >
          <span className="sf-alert-icon" aria-hidden="true">
            !
          </span>
          <p>{deleteError}</p>
        </div>
      )}
      <div className="sf-actions">
        <button
          type="button"
          className="sf-btn sf-btn-danger"
          data-testid="checklist-question-edit-delete"
          disabled={submitting || deleting}
          onClick={requestDelete}
        >
          {t('checklistQuestion.edit.deleteLabel')}
        </button>
      </div>
      <ConfirmDialog
        tone="danger"
        open={pendingDelete}
        title={t('checklistQuestion.edit.deleteConfirmTitle')}
        message={t('checklistQuestion.edit.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
