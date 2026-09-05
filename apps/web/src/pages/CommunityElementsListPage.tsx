import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import {
  listInspectableElements,
  type InspectableElement,
} from '../api/inspectable-element';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../inspectable-element/error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// spec.md "List Active Elements For a Community": distinct loading, empty,
// and error states (never a blank screen); the list request already
// excludes soft-deleted elements (ADR-010, `SoftDeletableRepository`), so
// this page performs no client-side filtering of its own (mirrors
// MaintenanceCompaniesListPage.tsx's precedent). Edit/soft-delete are out of
// scope for THIS page (tasks.md Phase 8: the edit form and its confirmed
// soft-delete live on InspectableElementEditPage.tsx, per design.md
// Decision 9 — the edit route does not exist yet, so no per-row link is
// added here until Phase 8 registers it). Error messages come exclusively
// from mapApiErrorToMessageKey (spec "No Server-Message String Coupling") —
// this page never reads `ApiError.message`. `elementType` is rendered
// exclusively through the label map (spec "Element Type Label Mapping") —
// the raw string `EXTINGUISHER` must never appear in the DOM.
export function CommunityElementsListPage() {
  const { t } = useTranslation();
  const { communityId } = useParams<{ communityId: string }>();
  const [elements, setElements] = useState<InspectableElement[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);

  // Mirrors MaintenanceCompaniesListPage.tsx's mount-effect pattern: a
  // .then/.catch chain (not async/await) so every setState call lives
  // inside a promise continuation, satisfying the react-hooks "no setState
  // directly in an effect" rule.
  const loadElements = useCallback(() => {
    if (communityId === undefined) {
      // Every setState call must live inside a promise continuation (see
      // comment above), even on this synchronous guard clause — otherwise
      // the react-hooks "no setState directly in an effect" rule fires.
      return Promise.resolve().then(() => {
        setLoadErrorKey(mapApiErrorToMessageKey(new ApiError(0)));
        setLoadState('error');
      });
    }

    return listInspectableElements(communityId)
      .then((result) => {
        setElements(result);
        setLoadState('loaded');
        setLoadErrorKey(null);
      })
      .catch((error: unknown) => {
        setLoadErrorKey(
          mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)),
        );
        setLoadState('error');
      });
  }, [communityId]);

  useEffect(() => {
    void loadElements();
  }, [loadElements]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('inspectableElement.list.title')}</h1>
        <p data-testid="community-elements-list-loading">
          {t('inspectableElement.list.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('inspectableElement.list.title')}</h1>
        <p data-testid="community-elements-list-error">
          {t(loadErrorKey ?? 'common.error.network')}
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('inspectableElement.list.title')}</h1>
      <Link
        to={`/communities/${communityId}/inspectable-elements/new`}
        data-testid="community-elements-list-create-link"
      >
        {t('inspectableElement.list.createLink')}
      </Link>
      {elements.length === 0 ? (
        <p data-testid="community-elements-list-empty">
          {t('inspectableElement.list.empty')}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('inspectableElement.list.columnType')}</th>
              <th>{t('inspectableElement.list.columnName')}</th>
              <th>{t('inspectableElement.list.columnDescription')}</th>
              <th>{t('inspectableElement.list.columnLocation')}</th>
              <th>{t('inspectableElement.list.columnSerialNumber')}</th>
              <th>{t('inspectableElement.list.columnInstalledAt')}</th>
              <th>{t('inspectableElement.list.columnCode')}</th>
              <th>{t('inspectableElement.list.columnActions')}</th>
            </tr>
          </thead>
          <tbody>
            {elements.map((row) => (
              <tr key={row.id} data-testid={`community-elements-list-row-${row.id}`}>
                <td>{t(mapElementTypeToLabelKey(row.elementType))}</td>
                <td>{row.name}</td>
                <td>{row.description ?? ''}</td>
                <td>{row.location}</td>
                <td>{row.serialNumber ?? ''}</td>
                <td>{row.installedAt}</td>
                <td>{row.code}</td>
                <td>
                  {/* design.md Decision 6: print is per-element only — no
                      list-level "print all" control exists anywhere on this
                      page. */}
                  <Link
                    to={`/communities/${communityId}/inspectable-elements/${row.id}/label`}
                    data-testid={`community-elements-list-print-${row.id}`}
                  >
                    {t('inspectableElement.list.printLink')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
