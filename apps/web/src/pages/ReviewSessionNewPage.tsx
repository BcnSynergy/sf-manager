import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { ElementType } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  getReviewScope,
  openReviewSession,
  type ReviewScope,
} from '../api/review-session';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../review-session/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// review-session-ui spec "Open a Session From Assigned Communities Only":
// GET /review-scope is already limited to the actor's actively-assigned
// communities and the active-template catalog (get-review-scope.use-case.ts,
// design.md Decision 5) — this page performs no client-side filtering of
// its own. "No active template exists for the chosen element type" is
// satisfied structurally rather than by a separate per-selection check:
// `scope.templates` already contains only active templates, so an empty
// list IS "no active template exists" (each template already names its own
// elementType — Decision 7 — there is no separate elementType-only step to
// pick before naming a template). Error messages come exclusively from
// mapApiErrorToMessageKey — this page never reads `ApiError.message`.
export function ReviewSessionNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [scope, setScope] = useState<ReviewScope | null>(null);

  const [communityId, setCommunityId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadScope = useCallback(() => {
    return getReviewScope()
      .then((result) => {
        setScope(result);
        setCommunityId(result.communities[0]?.id ?? '');
        setTemplateId(result.templates[0]?.id ?? '');
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
    void loadScope();
  }, [loadScope]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (communityId === '' || templateId === '') {
      setFormError(t('reviewSession.new.validationError'));
      return;
    }

    setSubmitting(true);
    try {
      const session = await openReviewSession({ communityId, templateId });
      navigate(`/review-sessions/${session.id}`);
    } catch (caughtError) {
      setFormError(
        t(mapApiErrorToMessageKey(caughtError instanceof ApiError ? caughtError : new ApiError(0))),
      );
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewSession.new.title')}</h1>
        <p data-testid="review-session-new-loading">{t('reviewSession.new.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error' || scope === null) {
    return (
      <main>
        <h1>{t('reviewSession.new.title')}</h1>
        <p data-testid="review-session-new-error">{t(loadErrorKey ?? 'common.error.network')}</p>
      </main>
    );
  }

  if (scope.communities.length === 0) {
    return (
      <main>
        <h1>{t('reviewSession.new.title')}</h1>
        <p data-testid="review-session-new-communities-empty">
          {t('reviewSession.new.communitiesEmpty')}
        </p>
      </main>
    );
  }

  if (scope.templates.length === 0) {
    return (
      <main>
        <h1>{t('reviewSession.new.title')}</h1>
        <p data-testid="review-session-new-templates-empty">
          {t('reviewSession.new.templatesEmpty')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('reviewSession.new.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <label htmlFor="review-session-new-community-input">
          {t('reviewSession.new.communityLabel')}
        </label>
        <select
          id="review-session-new-community-input"
          value={communityId}
          onChange={(event) => setCommunityId(event.target.value)}
          data-testid="review-session-new-community"
        >
          {scope.communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
        <label htmlFor="review-session-new-template-input">
          {t('reviewSession.new.templateLabel')}
        </label>
        <select
          id="review-session-new-template-input"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          data-testid="review-session-new-template"
        >
          {scope.templates.map((template) => (
            <option key={template.id} value={template.id}>
              {t(mapElementTypeToLabelKey(template.elementType as ElementType))} — {template.name}
            </option>
          ))}
        </select>
        {formError && <p data-testid="review-session-new-error-message">{formError}</p>}
        <button type="submit" data-testid="review-session-new-submit" disabled={submitting}>
          {t('reviewSession.new.submitLabel')}
        </button>
      </form>
    </main>
  );
}
