import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { AnswerValue } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  readReviewSession,
  recordEntry,
  resolveElementByCode,
  type ResolveElementResult,
} from '../api/review-session';
import { PageHeader } from '../components/PageHeader';
import { Alert, StatusRegion } from '../components/Alert';
import { useAlertMessage } from '../components/use-alert-message';
import { mapAnswerValueToLabelKey } from '../review-session/answer-value-labels';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

const ANSWER_VALUES: AnswerValue[] = ['YES', 'NO', 'NOT_APPLICABLE'];

type LoadState = 'loading' | 'loaded' | 'error';

// review-session-ui spec "Manual Code Entry Only": this route is reached
// exclusively by typing a code on ReviewSessionDetailPage.tsx (or clicking a
// gap link built from a server-supplied code) and resolving it through
// GET .../elements/:code — there is no camera, QR-scanning or media-device
// permission prompt anywhere in this file or its imports, satisfying "No
// camera or scanner dependency exists" by construction rather than by
// omission that would need re-verifying every time this file changes.
//
// review-session-ui spec "Rejected Codes Get One Uniform Message": whatever
// the resolve call's underlying rejection cause was (unknown, foreign
// community, wrong type, decommissioned, soft-deleted — all collapsed
// server-side to one ELEMENT_NOT_FOUND, design.md Decision 6), this page
// renders exactly the ONE key `mapApiErrorToMessageKey` returns for that
// code, read from `ApiError.status`/`.code` only — never `.message`.
//
// review-session-ui spec "A completed session still offers no mutating
// control" (TD-39): the resolve response carries no session status, so the
// session is read alongside it and a completed one renders its recorded
// entry read-only instead of the answer form.
export function ReviewSessionElementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId, code } = useParams<{ sessionId: string; code: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveElementResult | null>(null);
  const [completed, setCompleted] = useState(false);

  const [answers, setAnswers] = useState<Map<string, AnswerValue>>(new Map());
  const [markUnreviewed, setMarkUnreviewed] = useState(false);
  const [observations, setObservations] = useState('');

  const [saving, setSaving] = useState(false);
  const {
    message: saveError,
    key: saveErrorAlertKey,
    show: showSaveError,
    clear: clearSaveError,
  } = useAlertMessage();
  const [saved, setSaved] = useState(false);
  // Counts edits, so a save that resolves after one is not confirmed.
  const editCount = useRef(0);

  const loadElement = useCallback(() => {
    if (sessionId === undefined || code === undefined) {
      return Promise.resolve().then(() => {
        setLoadState('error');
      });
    }

    return Promise.all([resolveElementByCode(sessionId, code), readReviewSession(sessionId)])
      .then(([result, session]) => {
        setResolved(result);
        setCompleted(session.status === 'completed');
        if (result.entry) {
          setMarkUnreviewed(!result.entry.reviewed);
          setObservations(result.entry.observations ?? '');
          setAnswers(new Map(result.entry.answers.map((a) => [a.questionId, a.answer])));
        }
        setLoadState('loaded');
      })
      .catch((error: unknown) => {
        setLoadErrorKey(
          mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
        );
        setLoadState('error');
      });
  }, [sessionId, code]);

  useEffect(() => {
    void loadElement();
  }, [loadElement]);

  // EN-80: after an edit the form no longer shows what was saved, so the
  // confirmation and its Continue step are withdrawn and Save leads again.
  function markEdited() {
    editCount.current += 1;
    setSaved(false);
  }

  function setAnswer(questionId: string, value: AnswerValue) {
    markEdited();
    setAnswers((current) => new Map(current).set(questionId, value));
  }

  function changeMarkUnreviewed(value: boolean) {
    markEdited();
    setMarkUnreviewed(value);
  }

  function changeObservations(value: string) {
    markEdited();
    setObservations(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sessionId === undefined || resolved === null) {
      return;
    }
    clearSaveError();
    setSaved(false);
    const editsAtSave = editCount.current;

    setSaving(true);
    try {
      if (markUnreviewed) {
        if (observations.trim() === '') {
          showSaveError(t('reviewSession.error.missingObservations'));
          setSaving(false);
          return;
        }
        await recordEntry(sessionId, resolved.element.id, {
          observations: observations.trim(),
        });
      } else {
        if (answers.size !== resolved.questions.length) {
          showSaveError(t('reviewSession.error.answersDoNotMatchTemplate'));
          setSaving(false);
          return;
        }
        await recordEntry(sessionId, resolved.element.id, {
          answers: resolved.questions.map((question) => ({
            questionId: question.questionId,
            value: answers.get(question.questionId) as AnswerValue,
          })),
        });
      }
      // An edit made while the request was in flight is not in what was
      // saved, so it gets no confirmation.
      setSaved(editCount.current === editsAtSave);
    } catch (caughtError) {
      // review-session-ui spec "A save failure is reported without losing
      // entered answers": no state reset here on failure — `answers`/
      // `observations` stay exactly as the user left them.
      showSaveError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <PageHeader title={t('reviewSession.element.title')} />
        <p className="sf-empty" data-testid="review-session-element-loading">
          {t('reviewSession.element.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error' || resolved === null) {
    return (
      <main>
        <PageHeader title={t('reviewSession.element.title')} />
        <p className="sf-empty" data-testid="review-session-element-error">
          {t(loadErrorKey ?? 'reviewSession.element.notFound')}
        </p>
        <div className="sf-actions">
          <button
            type="button"
            className="sf-btn"
            data-testid="review-session-element-back"
            onClick={() => navigate(`/review-sessions/${sessionId}`)}
          >
            {t('reviewSession.element.backLabel')}
          </button>
        </div>
      </main>
    );
  }

  const elementPanel = (
    <div className="sf-panel">
      <p data-testid="review-session-element-name">{resolved.element.name}</p>
      <p data-testid="review-session-element-location">{resolved.element.location}</p>
    </div>
  );
  const sortedQuestions = resolved.questions.slice().sort((a, b) => a.order - b.order);

  if (completed) {
    const { entry } = resolved;
    return (
      <main>
        <PageHeader title={t('reviewSession.element.readOnlyTitle')} />
        {elementPanel}
        <div className="sf-alert" data-testid="review-session-element-completed-notice">
          <span className="sf-alert-icon" aria-hidden="true">
            i
          </span>
          <p>{t('reviewSession.detail.completedNotice')}</p>
        </div>
        {entry === null ? (
          <p className="sf-empty" data-testid="review-session-element-not-recorded">
            {t('reviewSession.element.notRecorded')}
          </p>
        ) : entry.reviewed ? (
          <section className="sf-section">
            <h2 className="sf-section-title">{t('reviewSession.element.questionsTitle')}</h2>
            <dl data-testid="review-session-element-recorded-answers">
              {sortedQuestions.map((question) => {
                const answer = entry.answers.find((a) => a.questionId === question.questionId);
                return (
                  <Fragment key={question.questionId}>
                    <dt>{question.text}</dt>
                    <dd>{answer ? t(mapAnswerValueToLabelKey(answer.answer)) : ''}</dd>
                  </Fragment>
                );
              })}
            </dl>
          </section>
        ) : (
          <p data-testid="review-session-element-recorded-unreviewed">
            <span className="sf-badge sf-badge-warning">
              {t('reviewSession.element.unreviewedLabel')}
            </span>{' '}
            <span>{entry.observations ?? ''}</span>
          </p>
        )}
        <div className="sf-actions">
          <button
            type="button"
            className="sf-btn"
            data-testid="review-session-element-back"
            onClick={() => navigate(`/review-sessions/${sessionId}`)}
          >
            {t('reviewSession.element.backLabel')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title={t('reviewSession.element.title')} />
      {elementPanel}

      <form className="sf-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label className="sf-choice" htmlFor="review-session-element-mark-unreviewed">
          <input
            id="review-session-element-mark-unreviewed"
            type="checkbox"
            checked={markUnreviewed}
            onChange={(event) => changeMarkUnreviewed(event.target.checked)}
            data-testid="review-session-element-mark-unreviewed"
          />
          {t('reviewSession.element.markUnreviewedToggle')}
        </label>

        {markUnreviewed ? (
          <div className="sf-field">
            <label htmlFor="review-session-element-observations-input">
              {t('reviewSession.element.observationsLabel')}
            </label>
            <textarea
              id="review-session-element-observations-input"
              value={observations}
              onChange={(event) => changeObservations(event.target.value)}
              data-testid="review-session-element-observations"
            />
          </div>
        ) : (
          <section className="sf-section" data-testid="review-session-element-questions">
            <h2 className="sf-section-title">{t('reviewSession.element.questionsTitle')}</h2>
            {sortedQuestions.map((question) => (
              <fieldset
                key={question.questionId}
                className="sf-field"
                data-testid={`review-session-element-question-${question.questionId}`}
              >
                <legend>{question.text}</legend>
                {ANSWER_VALUES.map((value) => (
                  <label key={value} className="sf-choice">
                    <input
                      type="radio"
                      name={`review-session-element-question-${question.questionId}`}
                      checked={answers.get(question.questionId) === value}
                      onChange={() => setAnswer(question.questionId, value)}
                      data-testid={`review-session-element-answer-${question.questionId}-${value}`}
                    />
                    {t(mapAnswerValueToLabelKey(value))}
                  </label>
                ))}
              </fieldset>
            ))}
          </section>
        )}

        {/* EN-80: the confirmation sits by the Save button just pressed, so it
            stays in view at the bottom of a long form on a phone. */}
        <StatusRegion>
          {saved && (
            <Alert
              tone="success"
              testId="review-session-element-saved"
              message={t('reviewSession.element.saveConfirmation')}
            >
              {/* spec "Saving is confirmed and the flow continues" — MUST be
                  returned to code entry for the next element. The code-entry
                  form lives on ReviewSessionDetailPage.tsx (design.md
                  Decision 10), so "returned to" is this explicit navigation
                  control rather than an automatic redirect that would hide the
                  confirmation the same requirement also demands. */}
              <div className="sf-actions">
                <button
                  type="button"
                  className="sf-btn sf-btn-primary"
                  data-testid="review-session-element-continue"
                  onClick={() => navigate(`/review-sessions/${sessionId}`)}
                >
                  {t('reviewSession.element.backLabel')}
                </button>
              </div>
            </Alert>
          )}
        </StatusRegion>
        {saveError && (
          <Alert
            key={saveErrorAlertKey}
            tone="danger"
            testId="review-session-element-save-error"
            message={saveError}
          />
        )}
        <div className="sf-actions">
          {/* Once saved, the next step is code entry (Continue above it), so
              Save steps down to a secondary button: one primary per view. */}
          <button
            type="submit"
            className={saved ? 'sf-btn' : 'sf-btn sf-btn-primary'}
            data-testid="review-session-element-save"
            disabled={saving}
          >
            {t('reviewSession.element.saveLabel')}
          </button>
        </div>
      </form>
    </main>
  );
}
