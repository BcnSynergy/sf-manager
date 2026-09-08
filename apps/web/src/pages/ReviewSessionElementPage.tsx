import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { AnswerValue } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  recordEntry,
  resolveElementByCode,
  type ResolveElementResult,
} from '../api/review-session';
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
export function ReviewSessionElementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId, code } = useParams<{ sessionId: string; code: string }>();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolveElementResult | null>(null);

  const [answers, setAnswers] = useState<Map<string, AnswerValue>>(new Map());
  const [markUnreviewed, setMarkUnreviewed] = useState(false);
  const [observations, setObservations] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadElement = useCallback(() => {
    if (sessionId === undefined || code === undefined) {
      return Promise.resolve().then(() => {
        setLoadState('error');
      });
    }

    return resolveElementByCode(sessionId, code)
      .then((result) => {
        setResolved(result);
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

  function setAnswer(questionId: string, value: AnswerValue) {
    setAnswers((current) => new Map(current).set(questionId, value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sessionId === undefined || resolved === null) {
      return;
    }
    setSaveError(null);
    setSaved(false);

    setSaving(true);
    try {
      if (markUnreviewed) {
        if (observations.trim() === '') {
          setSaveError(t('reviewSession.error.missingObservations'));
          setSaving(false);
          return;
        }
        await recordEntry(sessionId, resolved.element.id, {
          observations: observations.trim(),
        });
      } else {
        if (answers.size !== resolved.questions.length) {
          setSaveError(t('reviewSession.error.answersDoNotMatchTemplate'));
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
      setSaved(true);
    } catch (caughtError) {
      // review-session-ui spec "A save failure is reported without losing
      // entered answers": no state reset here on failure — `answers`/
      // `observations` stay exactly as the user left them.
      setSaveError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewSession.element.title')}</h1>
        <p data-testid="review-session-element-loading">{t('reviewSession.element.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error' || resolved === null) {
    return (
      <main>
        <h1>{t('reviewSession.element.title')}</h1>
        <p data-testid="review-session-element-error">
          {t(loadErrorKey ?? 'reviewSession.element.notFound')}
        </p>
        <button
          type="button"
          data-testid="review-session-element-back"
          onClick={() => navigate(`/review-sessions/${sessionId}`)}
        >
          {t('reviewSession.element.backLabel')}
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('reviewSession.element.title')}</h1>
      <p data-testid="review-session-element-name">{resolved.element.name}</p>
      <p data-testid="review-session-element-location">{resolved.element.location}</p>

      {saved && (
        <div data-testid="review-session-element-saved">
          <p>{t('reviewSession.element.saveConfirmation')}</p>
          {/* spec "Saving is confirmed and the flow continues" — MUST be
              returned to code entry for the next element. The code-entry
              form lives on ReviewSessionDetailPage.tsx (design.md
              Decision 10), so "returned to" is this explicit navigation
              control rather than an automatic redirect that would hide the
              confirmation the same requirement also demands. */}
          <button
            type="button"
            data-testid="review-session-element-continue"
            onClick={() => navigate(`/review-sessions/${sessionId}`)}
          >
            {t('reviewSession.element.backLabel')}
          </button>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label htmlFor="review-session-element-mark-unreviewed">
          <input
            id="review-session-element-mark-unreviewed"
            type="checkbox"
            checked={markUnreviewed}
            onChange={(event) => setMarkUnreviewed(event.target.checked)}
            data-testid="review-session-element-mark-unreviewed"
          />
          {t('reviewSession.element.markUnreviewedToggle')}
        </label>

        {markUnreviewed ? (
          <>
            <label htmlFor="review-session-element-observations-input">
              {t('reviewSession.element.observationsLabel')}
            </label>
            <textarea
              id="review-session-element-observations-input"
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
              data-testid="review-session-element-observations"
            />
          </>
        ) : (
          <section data-testid="review-session-element-questions">
            <h2>{t('reviewSession.element.questionsTitle')}</h2>
            {resolved.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((question) => (
                <fieldset
                  key={question.questionId}
                  data-testid={`review-session-element-question-${question.questionId}`}
                >
                  <legend>{question.text}</legend>
                  {ANSWER_VALUES.map((value) => (
                    <label key={value}>
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

        {saveError && <p data-testid="review-session-element-save-error">{saveError}</p>}
        <button type="submit" data-testid="review-session-element-save" disabled={saving}>
          {t('reviewSession.element.saveLabel')}
        </button>
      </form>
    </main>
  );
}
