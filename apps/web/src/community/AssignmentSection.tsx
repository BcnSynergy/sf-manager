import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import type { Assignment } from '../api/community';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapAssignmentStatusToLabelKey } from './assignment-status-labels';
import { mapApiErrorToMessageKey } from './error-messages';

type LoadState = 'loading' | 'loaded' | 'error';

// design.md Decision 3 — the shared container instantiated once for
// representatives and once for technicians. Deliberately carries no
// exclusivity/mode knowledge: it owns only its own list/loading/error
// state, an assign-by-userId form, and refetch-on-mutation. Whether a
// second row flips to deactivated after this section's `assign`/
// `reactivate` calls is decided entirely server-side and observed purely
// by re-rendering whatever `ops.list()` returns next (Data Flow diagram).
export type AssignmentOps = {
  list: () => Promise<Assignment[]>;
  assign: (userId: string) => Promise<unknown>;
  deactivate: (userId: string) => Promise<unknown>;
  reactivate: (userId: string) => Promise<unknown>;
};

export type AssignmentSectionKeys = {
  title: string;
  empty: string;
  assignLabel: string;
  confirmTitle: string;
  confirmMessage: string;
  ineligible: string;
};

export type AssignmentSectionProps = {
  ops: AssignmentOps;
  testIdPrefix: string;
  keys: AssignmentSectionKeys;
};

// Hard rule (design.md Decision 3): AssignmentSectionProps takes no
// boolean/mode prop that changes behaviour (e.g. isExclusive, mode,
// allowsMultipleActive). If a real behavioural difference ever emerges,
// the fix is splitting into two components, not adding a prop here.
export function AssignmentSection({ ops, testIdPrefix, keys }: AssignmentSectionProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [userIdInput, setUserIdInput] = useState('');
  const [assignErrorKey, setAssignErrorKey] = useState<string | null>(null);
  const [pendingDeactivateUserId, setPendingDeactivateUserId] = useState<string | null>(null);
  const [mutationPending, setMutationPending] = useState(false);

  // Mirrors UsersListPage.tsx's mount-effect pattern: a .then/.catch chain
  // (not async/await) so every setState call lives inside a promise
  // continuation, satisfying the react-hooks "no setState directly in an
  // effect" rule, and reused unchanged for the post-mutation refetch.
  const loadRows = useCallback(() => {
    return ops
      .list()
      .then((result) => {
        setRows(result);
        setLoadState('loaded');
        setLoadErrorKey(null);
      })
      .catch((error: unknown) => {
        setLoadErrorKey(mapApiErrorToMessageKey(error instanceof ApiError ? error : new ApiError(0)));
        setLoadState('error');
      });
  }, [ops]);

  useEffect(() => {
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one place this component overrides error-messages.ts's generic
  // mapping: INELIGIBLE_ROLE is section-specific copy (representative vs
  // technician), supplied by the caller via keys.ineligible
  // (design.md Interfaces/Contracts AssignmentSectionProps.keys.ineligible;
  // tasks.md 3.2, PR2 review flag). Every other code/status keeps the
  // generic mapper's result unchanged.
  function resolveAssignErrorKey(error: unknown): string {
    const apiError = error instanceof ApiError ? error : new ApiError(0);
    if (apiError.status === 409 && apiError.code === 'INELIGIBLE_ROLE') {
      return keys.ineligible;
    }
    return mapApiErrorToMessageKey(apiError);
  }

  async function handleAssignSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignErrorKey(null);
    const userId = userIdInput.trim();
    if (!userId) {
      return;
    }

    setMutationPending(true);
    try {
      await ops.assign(userId);
      setUserIdInput('');
      await loadRows();
    } catch (error) {
      setAssignErrorKey(resolveAssignErrorKey(error));
    } finally {
      setMutationPending(false);
    }
  }

  function requestDeactivate(userId: string) {
    setAssignErrorKey(null);
    setPendingDeactivateUserId(userId);
  }

  async function confirmDeactivate() {
    const userId = pendingDeactivateUserId;
    setPendingDeactivateUserId(null);
    if (!userId) {
      return;
    }

    setMutationPending(true);
    try {
      await ops.deactivate(userId);
      await loadRows();
    } catch (error) {
      setAssignErrorKey(resolveAssignErrorKey(error));
    } finally {
      setMutationPending(false);
    }
  }

  // Reactivate needs no confirmation step — only deactivate is a
  // destructive action requiring it (spec "Representative/Technician
  // Assignment Lifecycle" only names deactivate as confirmation-gated).
  async function handleReactivate(userId: string) {
    setAssignErrorKey(null);
    setMutationPending(true);
    try {
      await ops.reactivate(userId);
      await loadRows();
    } catch (error) {
      setAssignErrorKey(resolveAssignErrorKey(error));
    } finally {
      setMutationPending(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <section>
        <h2>{t(keys.title)}</h2>
        <p data-testid={`${testIdPrefix}-loading`} />
      </section>
    );
  }

  return (
    <section>
      <h2>{t(keys.title)}</h2>

      {loadState === 'error' && (
        <p data-testid={`${testIdPrefix}-error`}>{t(loadErrorKey ?? 'common.error.network')}</p>
      )}

      {loadState === 'loaded' && rows.length === 0 && (
        <p data-testid={`${testIdPrefix}-empty`}>{t(keys.empty)}</p>
      )}

      {loadState === 'loaded' && rows.length > 0 && (
        <ul>
          {rows.map((row) => (
            <li key={row.userId} data-testid={`${testIdPrefix}-row-${row.userId}`}>
              <span>{row.userId}</span>
              <span>{t(mapAssignmentStatusToLabelKey(row.deactivatedAt))}</span>
              {row.deactivatedAt === null ? (
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-deactivate-${row.userId}`}
                  onClick={() => requestDeactivate(row.userId)}
                  disabled={mutationPending}
                >
                  {t('common.deactivate')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`${testIdPrefix}-reactivate-${row.userId}`}
                  onClick={() => void handleReactivate(row.userId)}
                  disabled={mutationPending}
                >
                  {t('common.reactivate')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(event) => void handleAssignSubmit(event)} noValidate>
        <label htmlFor={`${testIdPrefix}-assign-input`}>{t(keys.assignLabel)}</label>
        <input
          id={`${testIdPrefix}-assign-input`}
          data-testid={`${testIdPrefix}-assign-input`}
          value={userIdInput}
          onChange={(event) => setUserIdInput(event.target.value)}
        />
        <button
          type="submit"
          data-testid={`${testIdPrefix}-assign-submit`}
          disabled={mutationPending}
        >
          {t(keys.assignLabel)}
        </button>
        {assignErrorKey && (
          <p data-testid={`${testIdPrefix}-assign-error`}>{t(assignErrorKey)}</p>
        )}
      </form>

      <ConfirmDialog
        open={pendingDeactivateUserId !== null}
        title={t(keys.confirmTitle)}
        message={t(keys.confirmMessage)}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setPendingDeactivateUserId(null)}
      />
    </section>
  );
}
