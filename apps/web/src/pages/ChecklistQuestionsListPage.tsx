import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ElementType } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  listChecklistQuestions,
  softDeleteChecklistQuestion,
  type ChecklistQuestion,
} from '../api/checklist-question';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../checklist-question/error-messages';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';

type LoadState = 'loading' | 'loaded' | 'error';

// spec.md "List the Question Pool": grouped by elementType, distinct
// loading/empty/error states (never a blank screen); the list request
// already excludes soft-deleted questions (ADR-010,
// SoftDeletableRepository), so this page performs no client-side filtering
// of its own beyond grouping (mirrors CommunityElementsListPage.tsx's
// precedent). `text` is rendered verbatim, never through t() (spec
// "Question Text Is Rendered Verbatim"). `elementType`/frequency render
// exclusively through their label maps (spec "Element Type and Frequency
// Label Mapping"). Soft-delete here is confirmed via ConfirmDialog and its
// copy MUST NOT imply a blocking dependency check (spec "Confirmed
// Soft-Delete" — deletion is never blocked).
export function ChecklistQuestionsListPage() {
  const { t } = useTranslation();
  const [questions, setQuestions] = useState<ChecklistQuestion[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Mirrors CommunityElementsListPage.tsx's mount-effect pattern: a
  // .then/.catch chain (not async/await) so every setState call lives
  // inside a promise continuation, satisfying the react-hooks "no setState
  // directly in an effect" rule.
  const loadQuestions = useCallback(() => {
    return listChecklistQuestions()
      .then((result) => {
        setQuestions(result);
        setLoadState('loaded');
        setLoadErrorKey(null);
      })
      .catch((error: unknown) => {
        setLoadErrorKey(
          mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
        );
        setLoadState('error');
      });
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  function requestDelete(id: string) {
    setDeleteErrorKey(null);
    setPendingDeleteId(id);
  }

  async function confirmDelete() {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (id === null) {
      return;
    }

    setDeletingId(id);
    try {
      await softDeleteChecklistQuestion(id);
      setQuestions((current) => current.filter((question) => question.id !== id));
      setDeletingId(null);
    } catch (caughtError) {
      setDeleteErrorKey(
        mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0)),
      );
      setDeletingId(null);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('checklistQuestion.list.title')}</h1>
        <p data-testid="checklist-question-list-loading">
          {t('checklistQuestion.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('checklistQuestion.list.title')}</h1>
        <p data-testid="checklist-question-list-error">
          {t(loadErrorKey ?? 'common.error.network')}
        </p>
      </main>
    );
  }

  const questionsByElementType = new Map<ElementType, ChecklistQuestion[]>();
  for (const question of questions) {
    const group = questionsByElementType.get(question.elementType);
    if (group) {
      group.push(question);
    } else {
      questionsByElementType.set(question.elementType, [question]);
    }
  }

  return (
    <main>
      <h1>{t('checklistQuestion.list.title')}</h1>
      <Link to="/checklist-questions/new" data-testid="checklist-question-list-create-link">
        {t('checklistQuestion.list.createLink')}
      </Link>
      {deleteErrorKey && (
        <p data-testid="checklist-question-list-delete-error">{t(deleteErrorKey)}</p>
      )}
      {questions.length === 0 ? (
        <p data-testid="checklist-question-list-empty">{t('checklistQuestion.list.empty')}</p>
      ) : (
        [...questionsByElementType.entries()].map(([elementType, groupQuestions]) => (
          <section key={elementType} data-testid={`checklist-question-group-${elementType}`}>
            <h2>{t(mapElementTypeToLabelKey(elementType))}</h2>
            <table>
              <thead>
                <tr>
                  <th>{t('checklistQuestion.list.columnText')}</th>
                  <th>{t('checklistQuestion.list.columnFrequencies')}</th>
                  <th>{t('checklistQuestion.list.columnActions')}</th>
                </tr>
              </thead>
              <tbody>
                {groupQuestions.map((question) => (
                  <tr key={question.id} data-testid={`checklist-question-list-row-${question.id}`}>
                    <td>{question.text}</td>
                    <td>
                      {question.frequencies.map((frequency) => (
                        <span
                          key={frequency}
                          data-testid={`checklist-question-frequency-tag-${question.id}-${frequency}`}
                        >
                          {t(mapReviewFrequencyToLabelKey(frequency))}
                        </span>
                      ))}
                    </td>
                    <td>
                      <Link
                        to={`/checklist-questions/${question.id}/edit`}
                        data-testid={`checklist-question-list-edit-${question.id}`}
                      >
                        {t('checklistQuestion.list.editLink')}
                      </Link>
                      <button
                        type="button"
                        data-testid={`checklist-question-list-delete-${question.id}`}
                        disabled={deletingId === question.id}
                        onClick={() => requestDelete(question.id)}
                      >
                        {t('checklistQuestion.list.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title={t('checklistQuestion.list.deleteConfirmTitle')}
        message={t('checklistQuestion.list.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </main>
  );
}
