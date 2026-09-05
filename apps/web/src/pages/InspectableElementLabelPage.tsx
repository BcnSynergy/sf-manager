import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { listCommunities, type Community } from '../api/community';
import { listInspectableElements, type InspectableElement } from '../api/inspectable-element';
import { ElementQrCode } from '../inspectable-element/ElementQrCode';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// spec.md / design.md Decision 6: a dedicated, reload-safe, shareable route
// for a single element's printable label. Data comes from the two existing
// list endpoints (list-and-select precedent, InspectableElementEditPage.tsx
// / ReviewTemplateDetailPage.tsx) — there is no `GET /:id` for either
// resource. A community that cannot be resolved BLOCKS the page into the
// generic error state rather than rendering the label without its context
// (design.md Decision 6 rationale: "a label missing its context is worse
// than a retry"), so `communityId` lookup failure and `elementId` lookup
// failure are NOT the same state: only the element miss is `not-found` — a
// missing community is `error`, matching every other page's
// one-error-state convention here.
//
// The QR itself (ElementQrCode) renders its matrix with zero quiet-zone
// margin (PR5 fresh-context review finding) — `.element-label-qr-wrapper`
// (index.css) supplies that whitespace so the printed/scanned code has real
// padding on every side instead of touching the label's own edge, both on
// screen and in `@media print`.
export function InspectableElementLabelPage() {
  const { t } = useTranslation();
  const { communityId, elementId } = useParams<{ communityId: string; elementId: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [element, setElement] = useState<InspectableElement | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);

  const loadAll = useCallback(() => {
    if (communityId === undefined || elementId === undefined) {
      // Every setState call must live inside a promise continuation, even on
      // this synchronous guard clause — otherwise the react-hooks "no
      // setState directly in an effect" rule fires (mirrors
      // InspectableElementEditPage.tsx's identical guard).
      return Promise.resolve().then(() => {
        setLoadState('error');
      });
    }

    return Promise.all([listInspectableElements(communityId), listCommunities()])
      .then(([elements, communities]) => {
        const foundElement = elements.find((candidate) => candidate.id === elementId);
        if (!foundElement) {
          setLoadState('not-found');
          return;
        }

        const foundCommunity = communities.find((candidate) => candidate.id === communityId);
        if (!foundCommunity) {
          setLoadState('error');
          return;
        }

        setElement(foundElement);
        setCommunity(foundCommunity);
        setLoadState('loaded');
      })
      .catch(() => {
        setLoadState('error');
      });
  }, [communityId, elementId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (loadState === 'loading') {
    return (
      <main>
        <h1>{t('inspectableElement.label.title')}</h1>
        <p data-testid="inspectable-element-label-loading">
          {t('inspectableElement.label.loading')}
        </p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('inspectableElement.label.title')}</h1>
        <p data-testid="inspectable-element-label-not-found">
          {t('inspectableElement.label.notFound')}
        </p>
      </main>
    );
  }

  if (loadState === 'error' || element === null || community === null) {
    return (
      <main>
        <h1>{t('inspectableElement.label.title')}</h1>
        <p data-testid="inspectable-element-label-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  return (
    <main className="label-print">
      <h1 data-print-hide>{t('inspectableElement.label.title')}</h1>
      <div className="element-label-qr-wrapper">
        <ElementQrCode code={element.code} />
      </div>
      <p data-testid="inspectable-element-label-code">{element.code}</p>
      <dl>
        <dt>{t('inspectableElement.label.nameLabel')}</dt>
        <dd data-testid="inspectable-element-label-name">{element.name}</dd>
        <dt>{t('inspectableElement.label.locationLabel')}</dt>
        <dd data-testid="inspectable-element-label-location">{element.location}</dd>
        <dt>{t('inspectableElement.label.communityLabel')}</dt>
        <dd data-testid="inspectable-element-label-community">{community.name}</dd>
      </dl>
      <button
        type="button"
        data-testid="inspectable-element-label-print"
        data-print-hide
        onClick={() => window.print()}
      >
        {t('inspectableElement.label.printLabel')}
      </button>
    </main>
  );
}
