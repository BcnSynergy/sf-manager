import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { listChecklistQuestions, type ChecklistQuestion } from '../api/checklist-question';
import { ApiError } from '../api/client';
import {
  activateReviewTemplate,
  listReviewTemplates,
  readReviewTemplate,
  setReviewTemplateQuestions,
  softDeleteDraftReviewTemplate,
  type ReviewTemplate,
} from '../api/review-template';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapApiErrorToMessageKey } from '../review-template/error-messages';
import { mapTemplateStatusToLabelKey } from '../review-template/template-status-labels';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// design.md Decision 9 — "the builder is one page with an inline picker".
// This single route (/review-templates/:templateId) renders one of two
// shapes depending on `template.status` (design.md Decision 5's `status`
// discriminant, spec.md "Frozen Versions Are Read-Only"):
//
//  - `draft`: an editable builder — an ordered "selected" panel (add/
//    remove/reorder + Save) plus an inline "available" picker panel
//    pre-filtered by the template's own `frequency` with a "show all
//    frequencies" toggle (spec "Draft Builder Selects and Orders
//    Questions"), a Delete control (spec "Delete Control Applies to
//    Drafts Only"), and an Activate action behind a ConfirmDialog whose
//    copy names the lineage's currently `active` version being retired —
//    resolved via `listReviewTemplates()` (the "list-and-select"
//    precedent from InspectableElementEditPage.tsx, adding no new API
//    surface, per design.md Decision 9).
//  - `active` / `retired`: a read-only render of `template.questions` (the
//    frozen snapshot for frozen statuses, the live pool text for a draft)
//    with NO picker, reorder, rename or re-activate control anywhere
//    (spec "No editing controls on a frozen version") and NO delete
//    control (spec "No delete control on frozen versions").
//
// No standalone "retire" control exists anywhere on this page — retirement
// is only ever a side effect of activating a successor (spec "No
// Standalone Retire Control").
export function ReviewTemplateDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [template, setTemplate] = useState<ReviewTemplate | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [selectedQuestionText, setSelectedQuestionText] = useState<Map<string, string>>(new Map());

  const [pool, setPool] = useState<ChecklistQuestion[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [showAllFrequencies, setShowAllFrequencies] = useState(false);

  const [currentActiveVersion, setCurrentActiveVersion] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingActivate, setPendingActivate] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const applyTemplate = useCallback((loaded: ReviewTemplate) => {
    setTemplate(loaded);
    const orderedQuestions = [...loaded.questions].sort((a, b) => a.order - b.order);
    setSelectedQuestionIds(orderedQuestions.map((question) => question.questionId));
    setSelectedQuestionText(
      new Map(orderedQuestions.map((question) => [question.questionId, question.text])),
    );
  }, []);

  const loadAll = useCallback(() => {
    if (templateId === undefined) {
      // Every setState call must live inside a promise continuation, even
      // on this synchronous guard clause — otherwise the react-hooks "no
      // setState directly in an effect" rule fires (mirrors
      // ChecklistQuestionEditPage.tsx's identical guard).
      return Promise.resolve().then(() => {
        setLoadState('error');
      });
    }

    return readReviewTemplate(templateId)
      .then((loaded) => {
        applyTemplate(loaded);
        setLoadState('loaded');

        if (loaded.status !== 'draft') {
          return undefined;
        }

        // Only a draft needs the live pool (for the picker) and the
        // lineage's current active version (for the activate confirm
        // copy) — a frozen version renders purely from its own snapshot.
        return Promise.all([
          listChecklistQuestions().then((questions) => {
            setPool(questions);
            setPoolLoaded(true);
          }),
          listReviewTemplates().then((templates) => {
            const active = templates.find(
              (candidate) =>
                candidate.elementType === loaded.elementType &&
                candidate.frequency === loaded.frequency &&
                candidate.status === 'active',
            );
            setCurrentActiveVersion(active?.version ?? null);
          }),
        ]).then(() => undefined);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          setLoadState('not-found');
          return;
        }
        setLoadState('error');
      });
  }, [templateId, applyTemplate]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function addQuestion(question: ChecklistQuestion) {
    setSelectedQuestionIds((current) => [...current, question.id]);
    setSelectedQuestionText((current) => new Map(current).set(question.id, question.text));
  }

  function removeQuestion(questionId: string) {
    setSelectedQuestionIds((current) => current.filter((id) => id !== questionId));
  }

  function moveQuestion(questionId: string, direction: -1 | 1) {
    setSelectedQuestionIds((current) => {
      const index = current.indexOf(questionId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved as string);
      return next;
    });
  }

  async function handleSave() {
    if (templateId === undefined) {
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await setReviewTemplateQuestions(templateId, selectedQuestionIds);
      applyTemplate(updated);
    } catch (caughtError) {
      setSaveError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
    } finally {
      setSaving(false);
    }
  }

  function requestActivate() {
    setActivateError(null);
    setPendingActivate(true);
  }

  async function confirmActivate() {
    setPendingActivate(false);
    if (templateId === undefined) {
      return;
    }
    setActivating(true);
    try {
      await activateReviewTemplate(templateId);
      const refreshed = await readReviewTemplate(templateId);
      applyTemplate(refreshed);
    } catch (caughtError) {
      setActivateError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
    } finally {
      setActivating(false);
    }
  }

  function requestDelete() {
    setDeleteError(null);
    setPendingDelete(true);
  }

  async function confirmDelete() {
    setPendingDelete(false);
    if (templateId === undefined) {
      return;
    }
    setDeleting(true);
    try {
      await softDeleteDraftReviewTemplate(templateId);
      navigate('/review-templates');
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
        <h1>{t('reviewTemplate.detail.title')}</h1>
        <p data-testid="review-template-detail-loading">{t('reviewTemplate.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('reviewTemplate.detail.title')}</h1>
        <p data-testid="review-template-detail-not-found">{t('reviewTemplate.detail.notFound')}</p>
      </main>
    );
  }

  if (loadState === 'error' || template === null) {
    return (
      <main>
        <h1>{t('reviewTemplate.detail.title')}</h1>
        <p data-testid="review-template-detail-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  const isDraft = template.status === 'draft';

  // Pre-filter the available panel by the template's own frequency
  // (spec "Frequency pre-filter is a default, not a lock") — the toggle
  // reveals questions tagged only for other frequencies without ever
  // making the pre-filter a hard restriction on selection.
  const availableQuestions = pool.filter(
    (question) =>
      !selectedQuestionIds.includes(question.id) &&
      (showAllFrequencies || question.frequencies.includes(template.frequency)),
  );

  const activateMessage =
    currentActiveVersion === null
      ? t('reviewTemplate.detail.activateConfirmMessageFirst')
      : t('reviewTemplate.detail.activateConfirmMessageWithRetirement', {
          version: currentActiveVersion,
        });

  return (
    <main>
      <h1>{t('reviewTemplate.detail.title')}</h1>
      <dl>
        <dt>{t('reviewTemplate.detail.nameLabel')}</dt>
        <dd data-testid="review-template-detail-name">{template.name}</dd>
        <dt>{t('reviewTemplate.detail.typeLabel')}</dt>
        <dd data-testid="review-template-detail-type">
          {t(mapElementTypeToLabelKey(template.elementType))}
        </dd>
        <dt>{t('reviewTemplate.detail.frequencyLabel')}</dt>
        <dd data-testid="review-template-detail-frequency">
          {t(mapReviewFrequencyToLabelKey(template.frequency))}
        </dd>
        <dt>{t('reviewTemplate.detail.versionLabel')}</dt>
        <dd data-testid="review-template-detail-version">
          {template.version ?? t('reviewTemplate.list.noVersion')}
        </dd>
        <dt>{t('reviewTemplate.detail.statusLabel')}</dt>
        <dd data-testid="review-template-detail-status">
          {t(mapTemplateStatusToLabelKey(template.status))}
        </dd>
      </dl>

      <section data-testid="review-template-detail-questions">
        <h2>{t('reviewTemplate.detail.questionsTitle')}</h2>
        {selectedQuestionIds.length === 0 ? (
          <p data-testid="review-template-detail-questions-empty">
            {t('reviewTemplate.detail.questionsEmpty')}
          </p>
        ) : (
          <ol>
            {selectedQuestionIds.map((questionId, index) => (
              <li key={questionId} data-testid={`review-template-detail-question-${questionId}`}>
                <span>{selectedQuestionText.get(questionId) ?? ''}</span>
                {isDraft && (
                  <>
                    <button
                      type="button"
                      data-testid={`review-template-detail-question-up-${questionId}`}
                      onClick={() => moveQuestion(questionId, -1)}
                      disabled={index === 0 || saving}
                    >
                      {t('reviewTemplate.detail.moveUp')}
                    </button>
                    <button
                      type="button"
                      data-testid={`review-template-detail-question-down-${questionId}`}
                      onClick={() => moveQuestion(questionId, 1)}
                      disabled={index === selectedQuestionIds.length - 1 || saving}
                    >
                      {t('reviewTemplate.detail.moveDown')}
                    </button>
                    <button
                      type="button"
                      data-testid={`review-template-detail-question-remove-${questionId}`}
                      onClick={() => removeQuestion(questionId)}
                      disabled={saving}
                    >
                      {t('reviewTemplate.detail.removeQuestion')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {isDraft && (
        <section data-testid="review-template-detail-picker">
          <h2>{t('reviewTemplate.detail.pickerTitle')}</h2>
          <label htmlFor="review-template-detail-show-all-frequencies">
            <input
              id="review-template-detail-show-all-frequencies"
              type="checkbox"
              checked={showAllFrequencies}
              onChange={(event) => setShowAllFrequencies(event.target.checked)}
              data-testid="review-template-detail-show-all-frequencies"
            />
            {t('reviewTemplate.detail.showAllFrequencies')}
          </label>
          {poolLoaded && pool.length === 0 ? (
            <p data-testid="review-template-detail-pool-empty">
              {t('reviewTemplate.detail.poolEmpty')}
            </p>
          ) : (
            <ul>
              {availableQuestions.map((question) => (
                <li key={question.id} data-testid={`review-template-detail-picker-item-${question.id}`}>
                  <span>{question.text}</span>
                  <button
                    type="button"
                    data-testid={`review-template-detail-picker-add-${question.id}`}
                    onClick={() => addQuestion(question)}
                    disabled={saving}
                  >
                    {t('reviewTemplate.detail.addQuestion')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {saveError && <p data-testid="review-template-detail-save-error">{saveError}</p>}
          <button
            type="button"
            data-testid="review-template-detail-save"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {t('reviewTemplate.detail.saveLabel')}
          </button>
        </section>
      )}

      {isDraft && (
        <section>
          {activateError && (
            <p data-testid="review-template-detail-activate-error">{activateError}</p>
          )}
          <button
            type="button"
            data-testid="review-template-detail-activate"
            onClick={requestActivate}
            disabled={activating}
          >
            {t('reviewTemplate.detail.activateLabel')}
          </button>
          {deleteError && <p data-testid="review-template-detail-delete-error">{deleteError}</p>}
          <button
            type="button"
            data-testid="review-template-detail-delete"
            onClick={requestDelete}
            disabled={deleting}
          >
            {t('reviewTemplate.detail.deleteLabel')}
          </button>
        </section>
      )}

      {/* Mounted conditionally, one at a time, rather than always-mounted
          with `open={boolean}` — ConfirmDialog's data-testid is a fixed
          "confirm-dialog" string shared by every caller, so two permanently
          mounted instances would collide on it. This isn't the first page
          with two confirmation flows: CommunityDetailPage has the same
          shape (two AssignmentSections, each with its own ConfirmDialog)
          and resolves the collision by scoping queries with `within()`
          against each section's own container. That approach doesn't
          transfer here — Activate and Delete share one section with no
          equivalent container boundary — so this page scopes the
          collision by only ever having one dialog mounted instead. */}
      {pendingActivate && (
        <ConfirmDialog
          open={pendingActivate}
          title={t('reviewTemplate.detail.activateConfirmTitle')}
          message={activateMessage}
          onConfirm={() => void confirmActivate()}
          onCancel={() => setPendingActivate(false)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          open={pendingDelete}
          title={t('reviewTemplate.detail.deleteConfirmTitle')}
          message={t('reviewTemplate.detail.deleteConfirmMessage')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(false)}
        />
      )}
    </main>
  );
}
