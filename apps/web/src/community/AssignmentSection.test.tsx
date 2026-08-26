import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import type { Assignment } from '../api/community';
import { AssignmentSection } from './AssignmentSection';

const keys = {
  title: 'test.section.title',
  empty: 'test.section.empty',
  assignLabel: 'test.section.assignLabel',
  confirmTitle: 'test.section.confirmTitle',
  confirmMessage: 'test.section.confirmMessage',
  ineligible: 'test.section.ineligible',
};

function makeOps(overrides: Partial<{
  list: () => Promise<Assignment[]>;
  assign: (userId: string) => Promise<unknown>;
  deactivate: (userId: string) => Promise<unknown>;
  reactivate: (userId: string) => Promise<unknown>;
}> = {}) {
  return {
    list: vi.fn<() => Promise<Assignment[]>>().mockResolvedValue([]),
    assign: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    reactivate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderSection(ops: ReturnType<typeof makeOps>, testIdPrefix = 'representatives') {
  return render(<AssignmentSection ops={ops} testIdPrefix={testIdPrefix} keys={keys} />);
}

describe('AssignmentSection', () => {
  it('shows a loading state while the list request is in flight', () => {
    const ops = makeOps({ list: vi.fn(() => new Promise<Assignment[]>(() => {})) });

    renderSection(ops);

    expect(screen.getByTestId('representatives-loading')).toBeInTheDocument();
  });

  it('shows an empty state when the list resolves with no rows', async () => {
    const ops = makeOps({ list: vi.fn().mockResolvedValue([]) });

    renderSection(ops);

    expect(await screen.findByTestId('representatives-empty')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) when the list request fails', async () => {
    const ops = makeOps({ list: vi.fn().mockRejectedValue(new ApiError(0)) });

    renderSection(ops);

    expect(await screen.findByTestId('representatives-error')).toBeInTheDocument();
    expect(screen.queryByTestId('representatives-loading')).not.toBeInTheDocument();
  });

  it('renders each row with the raw userId and its status label, not the raw enum value', async () => {
    const ops = makeOps({
      list: vi.fn().mockResolvedValue([
        { communityId: 'c1', userId: 'user-active', deactivatedAt: null },
        { communityId: 'c1', userId: 'user-deactivated', deactivatedAt: '2026-08-01T00:00:00.000Z' },
      ]),
    });

    renderSection(ops);

    const activeRow = await screen.findByTestId('representatives-row-user-active');
    expect(activeRow).toHaveTextContent('user-active');
    expect(activeRow).toHaveTextContent('Active');

    const deactivatedRow = screen.getByTestId('representatives-row-user-deactivated');
    expect(deactivatedRow).toHaveTextContent('user-deactivated');
    expect(deactivatedRow).toHaveTextContent('Deactivated');
  });

  it('assigns a pasted userId and refetches the list on success', async () => {
    const ops = makeOps({
      list: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ communityId: 'c1', userId: 'user-new', deactivatedAt: null }]),
      assign: vi.fn().mockResolvedValue({ communityId: 'c1', userId: 'user-new', deactivatedAt: null }),
    });

    renderSection(ops);

    await screen.findByTestId('representatives-empty');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'user-new' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    await waitFor(() => expect(ops.assign).toHaveBeenCalledWith('user-new'));
    expect(await screen.findByTestId('representatives-row-user-new')).toBeInTheDocument();
    expect(ops.list).toHaveBeenCalledTimes(2);
  });

  it('shows the generic mapped message on an ASSIGNMENT_ALREADY_EXISTS 409', async () => {
    const ops = makeOps({
      assign: vi.fn().mockRejectedValue(new ApiError(409, 'ASSIGNMENT_ALREADY_EXISTS')),
    });

    renderSection(ops);

    await screen.findByTestId('representatives-empty');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'user-dup' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    expect(await screen.findByTestId('representatives-assign-error')).toHaveTextContent(
      'community.error.assignmentExists',
    );
  });

  // tasks.md 3.2 (PR2 review flag) — a mocked assign whose failure carries
  // INELIGIBLE_ROLE (409) MUST render AssignmentSection's own
  // keys.ineligible-derived copy, NOT community/error-messages.ts's generic
  // `community.error.ineligibleRole` fallback key. error-messages.ts
  // deliberately returns the generic key expecting this component to
  // override it (design.md Interfaces/Contracts AssignmentSectionProps.keys.ineligible).
  it('overrides the generic INELIGIBLE_ROLE message with keys.ineligible', async () => {
    const ops = makeOps({
      assign: vi.fn().mockRejectedValue(new ApiError(409, 'INELIGIBLE_ROLE')),
    });

    renderSection(ops);

    await screen.findByTestId('representatives-empty');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'user-ineligible' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    const errorNode = await screen.findByTestId('representatives-assign-error');
    expect(errorNode).toHaveTextContent(keys.ineligible);
    expect(errorNode).not.toHaveTextContent('community.error.ineligibleRole');
  });

  it('requires confirmation before calling ops.deactivate', async () => {
    const ops = makeOps({
      list: vi.fn().mockResolvedValue([{ communityId: 'c1', userId: 'user-a', deactivatedAt: null }]),
    });

    renderSection(ops);

    fireEvent.click(await screen.findByTestId('representatives-deactivate-user-a'));

    expect(ops.deactivate).not.toHaveBeenCalled();
    expect(screen.getByTestId('confirm-dialog')).toHaveAttribute('open');
  });

  it('deactivates after confirmation and refetches the list', async () => {
    const ops = makeOps({
      list: vi
        .fn()
        .mockResolvedValueOnce([{ communityId: 'c1', userId: 'user-a', deactivatedAt: null }])
        .mockResolvedValueOnce([{ communityId: 'c1', userId: 'user-a', deactivatedAt: '2026-08-01T00:00:00.000Z' }]),
    });

    renderSection(ops);

    fireEvent.click(await screen.findByTestId('representatives-deactivate-user-a'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(ops.deactivate).toHaveBeenCalledWith('user-a'));
    await waitFor(() =>
      expect(screen.getByTestId('representatives-row-user-a')).toHaveTextContent(
        'Deactivated',
      ),
    );
    expect(ops.list).toHaveBeenCalledTimes(2);
  });

  it('does not deactivate when the confirmation dialog is cancelled', async () => {
    const ops = makeOps({
      list: vi.fn().mockResolvedValue([{ communityId: 'c1', userId: 'user-a', deactivatedAt: null }]),
    });

    renderSection(ops);

    fireEvent.click(await screen.findByTestId('representatives-deactivate-user-a'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(ops.deactivate).not.toHaveBeenCalled();
  });

  it('reactivates a deactivated row without a confirmation step and refetches', async () => {
    const ops = makeOps({
      list: vi
        .fn()
        .mockResolvedValueOnce([
          { communityId: 'c1', userId: 'user-a', deactivatedAt: '2026-08-01T00:00:00.000Z' },
        ])
        .mockResolvedValueOnce([{ communityId: 'c1', userId: 'user-a', deactivatedAt: null }]),
    });

    renderSection(ops);

    fireEvent.click(await screen.findByTestId('representatives-reactivate-user-a'));

    await waitFor(() => expect(ops.reactivate).toHaveBeenCalledWith('user-a'));
    await waitFor(() =>
      expect(screen.getByTestId('representatives-row-user-a')).toHaveTextContent(
        'Active',
      ),
    );
    expect(ops.list).toHaveBeenCalledTimes(2);
  });

  it('disables action buttons while a mutation is in flight', async () => {
    let resolveAssign: (() => void) | undefined;
    const ops = makeOps({
      assign: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveAssign = () => resolve(undefined);
          }),
      ),
    });

    renderSection(ops);

    await screen.findByTestId('representatives-empty');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'user-pending' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    await waitFor(() => expect(screen.getByTestId('representatives-assign-submit')).toBeDisabled());
    resolveAssign?.();
  });

  // Testing Strategy: "a mocked assign whose refetch returns the incumbent
  // deactivated renders that row as deactivated (the swap, at component
  // level)" — design.md Decision 3 / Data Flow. Nothing in the component
  // predicts this; it only re-renders from what ops.list() returns.
  it('renders the server-driven exclusivity swap after a refetch, at component level', async () => {
    const ops = makeOps({
      list: vi
        .fn()
        .mockResolvedValueOnce([{ communityId: 'c1', userId: 'incumbent', deactivatedAt: null }])
        .mockResolvedValueOnce([
          { communityId: 'c1', userId: 'incumbent', deactivatedAt: '2026-08-26T00:00:00.000Z' },
          { communityId: 'c1', userId: 'new-active', deactivatedAt: null },
        ]),
      assign: vi.fn().mockResolvedValue(undefined),
    });

    renderSection(ops);

    await screen.findByTestId('representatives-row-incumbent');
    fireEvent.change(screen.getByTestId('representatives-assign-input'), {
      target: { value: 'new-active' },
    });
    fireEvent.click(screen.getByTestId('representatives-assign-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('representatives-row-incumbent')).toHaveTextContent(
        'Deactivated',
      ),
    );
    expect(screen.getByTestId('representatives-row-new-active')).toHaveTextContent(
      'Active',
    );
  });

  it('supports a different testIdPrefix without any behavioral prop', async () => {
    const ops = makeOps({
      list: vi.fn().mockResolvedValue([{ communityId: 'c1', userId: 'tech-a', deactivatedAt: null }]),
    });

    renderSection(ops, 'technicians');

    expect(await screen.findByTestId('technicians-row-tech-a')).toBeInTheDocument();
  });
});
