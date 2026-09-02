import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { updateInspectableElementSchema, type ElementType } from '@sf-manager/validation';
import { ApiError } from '../api/client';
import {
  listInspectableElements,
  softDeleteInspectableElement,
  updateInspectableElement,
} from '../api/inspectable-element';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapElementTypeToLabelKey } from '../inspectable-element/element-type-labels';
import { mapApiErrorToMessageKey } from '../inspectable-element/error-messages';

type LoadState = 'loading' | 'loaded' | 'not-found' | 'error';

// spec.md "Edit Inspectable Element" / "Soft-Delete Inspectable Element". No
// `GET /communities/:communityId/inspectable-elements/:elementId` exists
// (design.md Decision 9 / Interfaces) — this is the only caller that needs
// to resolve :elementId, so the list-and-select is inlined here rather than
// extracted into a shared hook, mirroring MaintenanceCompanyEditPage.tsx's
// single-caller precedent (design.md Decision 9 explicitly calls this out).
// Load states are the same four as that page: loading | loaded | not-found
// | error.
//
// `elementType` and `communityId` are NOT editable (design.md Interfaces,
// InspectableElementRepository.updateById comment) — the form renders the
// type as read-only text through the label map, never as an editable
// control, and never sends either field in the update payload.
//
// description/serialNumber: an emptied field is sent as explicit `null`
// (clears it) rather than `undefined` (leaves it alone) — this form is
// always fully prefilled, so a blank value on submit is a deliberate clear
// by the admin, not "field not touched" (design.md Interfaces comment on
// updateInspectableElementSchema's `.nullable()`).
export function InspectableElementEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { communityId, elementId } = useParams<{ communityId: string; elementId: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [elementType, setElementType] = useState<ElementType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [installedAt, setInstalledAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (communityId === undefined || elementId === undefined) {
      // Every setState call must live inside a promise continuation, even on
      // this synchronous guard clause — otherwise the react-hooks "no
      // setState directly in an effect" rule fires (mirrors
      // CommunityElementsListPage.tsx's identical guard).
      Promise.resolve().then(() => {
        if (!cancelled) {
          setLoadState('error');
        }
      });
      return;
    }

    listInspectableElements(communityId)
      .then((elements) => {
        if (cancelled) {
          return;
        }
        const found = elements.find((candidate) => candidate.id === elementId);
        if (!found) {
          setLoadState('not-found');
          return;
        }
        setElementType(found.elementType);
        setName(found.name);
        setDescription(found.description ?? '');
        setLocation(found.location);
        setSerialNumber(found.serialNumber ?? '');
        setInstalledAt(found.installedAt);
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
  }, [communityId, elementId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const result = updateInspectableElementSchema.safeParse({
      name,
      description: description.trim() === '' ? null : description,
      location,
      serialNumber: serialNumber.trim() === '' ? null : serialNumber,
      installedAt,
    });
    if (!result.success) {
      setError(t('inspectableElement.edit.validationError'));
      return;
    }

    if (communityId === undefined || elementId === undefined) {
      return;
    }

    setSubmitting(true);
    try {
      await updateInspectableElement(communityId, elementId, result.data);
      navigate(`/communities/${communityId}/inspectable-elements`);
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
    if (communityId === undefined || elementId === undefined) {
      return;
    }

    setDeleting(true);
    try {
      await softDeleteInspectableElement(communityId, elementId);
      navigate(`/communities/${communityId}/inspectable-elements`);
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
        <h1>{t('inspectableElement.edit.title')}</h1>
        <p data-testid="inspectable-element-edit-loading">{t('inspectableElement.list.loading')}</p>
      </main>
    );
  }

  if (loadState === 'not-found') {
    return (
      <main>
        <h1>{t('inspectableElement.edit.title')}</h1>
        <p data-testid="inspectable-element-edit-not-found">
          {t('inspectableElement.edit.notFound')}
        </p>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main>
        <h1>{t('inspectableElement.edit.title')}</h1>
        <p data-testid="inspectable-element-edit-error-state">{t('common.error.network')}</p>
      </main>
    );
  }

  return (
    <main>
      <h1>{t('inspectableElement.edit.title')}</h1>
      {/* noValidate: validation messages are ours (i18n-driven), not the
          browser's native, locale-inconsistent constraint-validation UI */}
      <form onSubmit={handleSubmit} noValidate>
        <p>
          {t('inspectableElement.edit.typeLabel')}:{' '}
          <span data-testid="inspectable-element-edit-type">
            {elementType !== null ? t(mapElementTypeToLabelKey(elementType)) : ''}
          </span>
        </p>
        <label htmlFor="inspectable-element-edit-name-input">
          {t('inspectableElement.edit.nameLabel')}
        </label>
        <input
          id="inspectable-element-edit-name-input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="inspectable-element-edit-name"
        />
        <label htmlFor="inspectable-element-edit-description-input">
          {t('inspectableElement.edit.descriptionLabel')}
        </label>
        <input
          id="inspectable-element-edit-description-input"
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="inspectable-element-edit-description"
        />
        <label htmlFor="inspectable-element-edit-location-input">
          {t('inspectableElement.edit.locationLabel')}
        </label>
        <input
          id="inspectable-element-edit-location-input"
          type="text"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          data-testid="inspectable-element-edit-location"
        />
        <label htmlFor="inspectable-element-edit-serial-number-input">
          {t('inspectableElement.edit.serialNumberLabel')}
        </label>
        <input
          id="inspectable-element-edit-serial-number-input"
          type="text"
          value={serialNumber}
          onChange={(event) => setSerialNumber(event.target.value)}
          data-testid="inspectable-element-edit-serial-number"
        />
        <label htmlFor="inspectable-element-edit-installed-at-input">
          {t('inspectableElement.edit.installedAtLabel')}
        </label>
        <input
          id="inspectable-element-edit-installed-at-input"
          type="date"
          value={installedAt}
          onChange={(event) => setInstalledAt(event.target.value)}
          data-testid="inspectable-element-edit-installed-at"
        />
        {error && <p data-testid="inspectable-element-edit-error">{error}</p>}
        <button
          type="submit"
          data-testid="inspectable-element-edit-submit"
          disabled={submitting || deleting}
        >
          {t('inspectableElement.edit.submitLabel')}
        </button>
      </form>
      {deleteError && (
        <p data-testid="inspectable-element-edit-delete-error">{deleteError}</p>
      )}
      <button
        type="button"
        data-testid="inspectable-element-edit-delete"
        disabled={submitting || deleting}
        onClick={requestDelete}
      >
        {t('inspectableElement.edit.deleteLabel')}
      </button>
      <ConfirmDialog
        open={pendingDelete}
        title={t('inspectableElement.edit.deleteConfirmTitle')}
        message={t('inspectableElement.edit.deleteConfirmMessage')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(false)}
      />
    </main>
  );
}
