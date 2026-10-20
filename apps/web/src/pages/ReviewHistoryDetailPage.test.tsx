import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as reviewHistoryApi from '../api/review-history';
import { ReviewHistoryDetailPage } from './ReviewHistoryDetailPage';

vi.mock('../api/review-history');

const mockedReadReviewHistory = vi.mocked(reviewHistoryApi.readReviewHistory);

const SESSION_ID = 'session-1';

const detail = {
  id: SESSION_ID,
  communityId: 'c1',
  templateId: 't1',
  performedById: 'u1',
  performedByEmail: 'tech@sf-manager.example',
  status: 'completed' as const,
  startedAt: '2026-09-01T00:00:00.000Z',
  completedAt: '2026-09-01T01:00:00.000Z',
  entries: [
    {
      inspectableElementId: 'e1',
      elementCode: 'AB3456789C',
      reviewed: true,
      observations: null,
      answers: [{ questionId: 'q1', answer: 'YES' as const }],
      recordedAt: '2026-09-01T00:30:00.000Z',
    },
    {
      inspectableElementId: 'e2',
      elementCode: null,
      reviewed: false,
      observations: 'Access blocked',
      answers: [],
      recordedAt: '2026-09-01T00:45:00.000Z',
    },
  ],
  coverage: { reviewed: 1, unreviewed: 1 },
  questions: [{ questionId: 'q1', order: 1, text: 'Is the extinguisher charged?' }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-history/${SESSION_ID}`]}>
      <Routes>
        <Route path="/review-history/:sessionId" element={<ReviewHistoryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReviewHistoryDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the detail request is in flight', () => {
    mockedReadReviewHistory.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-history-detail-loading')).toBeInTheDocument();
  });

  it('shows a uniform error message on a 404 (unreachable session)', async () => {
    mockedReadReviewHistory.mockRejectedValue(new ApiError(404, 'REVIEW_SESSION_NOT_FOUND'));

    renderPage();

    expect(await screen.findByTestId('review-history-detail-error')).toBeInTheDocument();
  });

  it('shows an error state (not blank or loading) on an unexpected failure', async () => {
    mockedReadReviewHistory.mockRejectedValue(new ApiError(0));

    renderPage();

    expect(await screen.findByTestId('review-history-detail-error')).toBeInTheDocument();
  });

  it('renders each entry with its answers, paired with the snapshotted question wording', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const entry = await screen.findByTestId('review-history-detail-entry-e1');
    expect(entry).toHaveTextContent('Is the extinguisher charged?');
    expect(entry).toHaveTextContent('Yes');
    expect(entry).not.toHaveTextContent('YES');
  });

  it('renders the observations for an unreviewed entry', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const observations = await screen.findByTestId('review-history-detail-observations-e2');
    expect(observations).toHaveTextContent('Access blocked');
  });

  it('renders the element code when present', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const entry = await screen.findByTestId('review-history-detail-entry-e1');
    expect(entry).toHaveTextContent('AB3456789C');
  });

  it('renders a neutral localized label instead of a blank code when elementCode is null', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const codeCell = await screen.findByTestId('review-history-detail-entry-code-e2');
    expect(codeCell.textContent).not.toBe('');
    expect(codeCell.textContent).not.toBe('null');
  });

  // review-history verify-report S-1: `questionTextById.get(...) ?? answer.questionId`
  // fell back to the RAW question id (a UUID) when the snapshot has no matching
  // question. Mirrors the "no raw identifier shown to users" rule already applied
  // to `elementCode` above — a localized neutral label replaces the id instead.
  it('renders a localized label, not the raw question id, for an answer with no matching question snapshot', async () => {
    mockedReadReviewHistory.mockResolvedValue({
      ...detail,
      entries: [
        {
          inspectableElementId: 'e-orphan',
          elementCode: 'AB3456789C',
          reviewed: true,
          observations: null,
          answers: [{ questionId: 'q-missing', answer: 'YES' as const }],
          recordedAt: '2026-09-01T00:30:00.000Z',
        },
      ],
      questions: [],
    });

    renderPage();

    const entry = await screen.findByTestId('review-history-detail-entry-e-orphan');
    expect(entry).toHaveTextContent('Unknown question');
    expect(entry).not.toHaveTextContent('q-missing');
  });

  it('renders no mutation control of any kind — this is a read-only history view', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    await screen.findByTestId('review-history-detail-entry-e1');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelector('form')).not.toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
  });

  // review-history-company-scope spec "A manager reads back a session
  // performed under their company" — same recorded record every role sees,
  // no manager-specific variant. design.md Decision 8: performer email
  // rendered for every role.
  it('renders the performer line for every role', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    expect(await screen.findByTestId('review-history-detail-performer')).toHaveTextContent(
      'tech@sf-manager.example',
    );
  });

  it('renders a neutral placeholder when performedByEmail is empty (unresolvable performer)', async () => {
    mockedReadReviewHistory.mockResolvedValue({ ...detail, performedByEmail: '' });

    renderPage();

    const performerLine = await screen.findByTestId('review-history-detail-performer');
    expect(performerLine.textContent).not.toBe('');
    expect(performerLine).toHaveTextContent(/^Unknown performer$/);
  });

  // review-history-per-element/design.md Decision 7: the second of the
  // two entry links into ElementReviewHistoryPage — the one that makes the
  // four non-admin scopes reachable in a browser at all (the other is on
  // CommunityElementsListPage, SYSTEM_ADMIN-only).
  it('renders a per-entry element-history link for an entry with a resolvable element', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    const link1 = await screen.findByTestId('review-history-detail-entry-history-e1');
    expect(link1).toHaveAttribute(
      'href',
      `/communities/${detail.communityId}/inspectable-elements/e1/history`,
    );
  });

  // review-history-per-element/spec.md "Two Entry Links Reach the Element
  // History Page": an entry whose element no longer resolves (elementCode
  // === null, e.g. soft-deleted) MUST NOT offer the link at all, rather
  // than one that leads to a rejection.
  it('does not render a per-entry element-history link when the element no longer resolves', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    await screen.findByTestId('review-history-detail-entry-e2');

    expect(screen.queryByTestId('review-history-detail-entry-history-e2')).not.toBeInTheDocument();
  });

  it('renders no manager-specific variant and still no mutation control', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    await screen.findByTestId('review-history-detail-performer');

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(document.querySelector('form')).not.toBeInTheDocument();
    expect(document.querySelector('input')).not.toBeInTheDocument();
  });

  // review-document-ui spec "Exactly One Entry Link Reaches the Document
  // Page", review-history-ui spec "The view offers one View document link":
  // this is the single link into the document page, offered for every one
  // of the five history roles (this page's API read is already scoped by
  // history for all five — no role-specific branching needed here).
  it("renders exactly one View document link leading to this session's document page", async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    await screen.findByTestId('review-history-detail-performer');

    const links = screen.getAllByTestId('review-history-detail-document-link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', `/review-history/${SESSION_ID}/document`);
  });

  // review-history-ui spec "The link changes nothing else on the view":
  // the View document link must be the only addition — every other
  // rendering (entries, answers, observations, element-history links,
  // no mutating control) already asserted by the tests above stays as-is.
  it('changes nothing else: entries and element-history links still render alongside the new link', async () => {
    mockedReadReviewHistory.mockResolvedValue(detail);

    renderPage();

    expect(await screen.findByTestId('review-history-detail-entry-e1')).toBeInTheDocument();
    expect(screen.getByTestId('review-history-detail-entry-history-e1')).toBeInTheDocument();
    expect(screen.getByTestId('review-history-detail-document-link')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  describe('design system styling', () => {
    it('renders the loading and error states in empty-state boxes under a page header', async () => {
      mockedReadReviewHistory.mockReturnValue(new Promise(() => {}));
      const { unmount } = renderPage();
      expect(screen.getByTestId('review-history-detail-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      unmount();

      mockedReadReviewHistory.mockRejectedValue(new ApiError(0));
      renderPage();
      expect(await screen.findByTestId('review-history-detail-error')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('renders View document as the primary action in the page header', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const link = await screen.findByTestId('review-history-detail-document-link');
      expect(link).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(link.closest('.sf-page-header')).toBe(
        screen.getByRole('heading', { level: 1 }).parentElement,
      );
    });

    it('shows the session summary as a labelled detail list inside a panel', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const completedAt = await screen.findByTestId('review-history-detail-completed-at');
      const list = completedAt.closest('dl');
      expect(list).not.toBeNull();
      expect(list?.parentElement).toHaveClass('sf-panel');
      const summary = within(list as HTMLElement);
      expect(summary.getAllByRole('term').map((term) => term.textContent)).toEqual([
        'Completed at',
        'Performed by',
        'Coverage',
      ]);
      expect(completedAt).toHaveClass('sf-data');
      expect(completedAt).toHaveTextContent(/^2026-09-01T01:00:00\.000Z$/);
      expect(screen.getByTestId('review-history-detail-performer')).toHaveTextContent(
        /^tech@sf-manager\.example$/,
      );
      expect(screen.getByTestId('review-history-detail-coverage')).toHaveTextContent(
        /^1 reviewed, 1 not reviewed$/,
      );
    });

    it('renders the entries as a titled section of one panel per entry, in order', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const section = await screen.findByTestId('review-history-detail-entries');
      expect(section).toHaveClass('sf-section');
      expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(
        'Reviewed elements',
      );
      const entries = within(section).getAllByRole('listitem');
      expect(entries.map((entry) => entry.dataset.testid)).toEqual([
        'review-history-detail-entry-e1',
        'review-history-detail-entry-e2',
      ]);
      for (const entry of entries) {
        expect(entry).toHaveClass('sf-panel');
      }
      expect(entries[0].parentElement).toHaveClass('sf-stack');
    });

    it('titles each entry by its element code with the history link as a secondary button', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const entry = await screen.findByTestId('review-history-detail-entry-e1');
      const title = within(entry).getByRole('heading', { level: 3 });
      expect(title).toHaveClass('sf-section-title');
      expect(title).toHaveTextContent('AB3456789C');
      expect(screen.getByTestId('review-history-detail-entry-code-e1')).toHaveClass('sf-data');

      const unknownEntry = screen.getByTestId('review-history-detail-entry-e2');
      expect(within(unknownEntry).getByRole('heading', { level: 3 })).toHaveTextContent(
        /^Unknown element$/,
      );
      expect(screen.getByTestId('review-history-detail-entry-code-e2')).not.toHaveClass('sf-data');

      const history = screen.getByTestId('review-history-detail-entry-history-e1');
      expect(history).toHaveClass('sf-btn');
      expect(history).not.toHaveClass('sf-btn-primary');
    });

    it('lists a reviewed entry answers as question and answer pairs', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const entry = await screen.findByTestId('review-history-detail-entry-e1');
      expect(
        within(entry)
          .getAllByRole('term')
          .map((term) => term.textContent),
      ).toEqual(['Is the extinguisher charged?']);
      expect(
        within(entry)
          .getAllByRole('definition')
          .map((value) => value.textContent),
      ).toEqual(['Yes']);
    });

    it('marks an unreviewed entry with a warning badge next to its observations', async () => {
      mockedReadReviewHistory.mockResolvedValue(detail);

      renderPage();

      const entry = await screen.findByTestId('review-history-detail-entry-e2');
      expect(within(entry).getByText('Not reviewed')).toHaveClass('sf-badge', 'sf-badge-warning');
      expect(screen.getByTestId('review-history-detail-observations-e2')).toHaveTextContent(
        /^Access blocked$/,
      );
    });

    it('renders the empty entries state in an empty-state box', async () => {
      mockedReadReviewHistory.mockResolvedValue({ ...detail, entries: [] });

      renderPage();

      expect(await screen.findByTestId('review-history-detail-entries-empty')).toHaveClass(
        'sf-empty',
      );
    });
  });
});
