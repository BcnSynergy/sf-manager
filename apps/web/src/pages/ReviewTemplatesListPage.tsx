import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { ElementType, ReviewFrequency } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import { listReviewTemplates, type ReviewTemplateListItem } from '../api/review-template';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapReviewFrequencyToLabelKey } from '../checklist-question/review-frequency-labels';
import { mapApiErrorToMessageKey } from '../review-template/error-messages';
import { mapTemplateStatusToLabelKey } from '../review-template/template-status-labels';

type LoadState = 'loading' | 'loaded' | 'error';

type LineageKey = `${ElementType}::${ReviewFrequency}`;

function buildLineageKey(elementType: ElementType, frequency: ReviewFrequency): LineageKey {
  return `${elementType}::${frequency}`;
}

// spec.md "List Templates With Version and Status": grouped by
// elementType + frequency, each row showing name/version/status badge,
// distinct loading/empty/error states (never a blank screen). The list
// request already excludes soft-deleted drafts (ADR-010), so this page
// performs no client-side filtering of its own beyond grouping — mirrors
// ChecklistQuestionsListPage.tsx's precedent. `frequency`/`status` render
// exclusively through their label maps (spec "Frequency and Status Label
// Mapping").
export function ReviewTemplatesListPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<ReviewTemplateListItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  // Mirrors ChecklistQuestionsListPage.tsx's mount-effect pattern: a
  // .then/.catch chain (not async/await) so every setState call lives
  // inside a promise continuation, satisfying the react-hooks "no setState
  // directly in an effect" rule.
  const loadTemplates = useCallback(() => {
    return listReviewTemplates()
      .then((result) => {
        setTemplates(result);
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
    void loadTemplates();
  }, [loadTemplates]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('reviewTemplate.list.title')}</h1>
        <p data-testid="review-template-list-loading">{t('reviewTemplate.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('reviewTemplate.list.title')}</h1>
        <p data-testid="review-template-list-error">{t(loadErrorKey ?? 'common.error.network')}</p>
      </main>
    );
  }

  const templatesByLineage = new Map<LineageKey, ReviewTemplateListItem[]>();
  for (const template of templates) {
    const key = buildLineageKey(template.elementType, template.frequency);
    const group = templatesByLineage.get(key);
    if (group) {
      group.push(template);
    } else {
      templatesByLineage.set(key, [template]);
    }
  }

  return (
    <main>
      <h1>{t('reviewTemplate.list.title')}</h1>
      <Link to="/review-templates/new" data-testid="review-template-list-create-link">
        {t('reviewTemplate.list.createLink')}
      </Link>
      {templates.length === 0 ? (
        <p data-testid="review-template-list-empty">{t('reviewTemplate.list.empty')}</p>
      ) : (
        [...templatesByLineage.entries()].map(([lineageKey, groupTemplates]) => {
          const [elementType, frequency] = groupTemplates[0]
            ? [groupTemplates[0].elementType, groupTemplates[0].frequency]
            : (lineageKey.split('::') as [ElementType, ReviewFrequency]);
          return (
            <section key={lineageKey} data-testid={`review-template-group-${lineageKey}`}>
              <h2>
                {t(mapElementTypeToLabelKey(elementType))} — {t(mapReviewFrequencyToLabelKey(frequency))}
              </h2>
              <table>
                <thead>
                  <tr>
                    <th>{t('reviewTemplate.list.columnName')}</th>
                    <th>{t('reviewTemplate.list.columnVersion')}</th>
                    <th>{t('reviewTemplate.list.columnStatus')}</th>
                    <th>{t('reviewTemplate.list.columnActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTemplates.map((template) => (
                    <tr key={template.id} data-testid={`review-template-list-row-${template.id}`}>
                      <td>{template.name}</td>
                      <td data-testid={`review-template-list-version-${template.id}`}>
                        {template.version ?? t('reviewTemplate.list.noVersion')}
                      </td>
                      <td data-testid={`review-template-list-status-${template.id}`}>
                        {t(mapTemplateStatusToLabelKey(template.status))}
                      </td>
                      <td>
                        <Link
                          to={`/review-templates/${template.id}`}
                          data-testid={`review-template-list-view-${template.id}`}
                        >
                          {t('reviewTemplate.list.viewLink')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </main>
  );
}
