import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import '../i18n';
import { ApiError } from '../api/client';
import * as checklistQuestionApi from '../api/checklist-question';
import * as reviewTemplateApi from '../api/review-template';
import { ReviewTemplateDetailPage } from './ReviewTemplateDetailPage';

vi.mock('../api/checklist-question');
vi.mock('../api/review-template');

const mockedListChecklistQuestions = vi.mocked(checklistQuestionApi.listChecklistQuestions);
const mockedReadReviewTemplate = vi.mocked(reviewTemplateApi.readReviewTemplate);
const mockedListReviewTemplates = vi.mocked(reviewTemplateApi.listReviewTemplates);
const mockedSetReviewTemplateQuestions = vi.mocked(reviewTemplateApi.setReviewTemplateQuestions);
const mockedActivateReviewTemplate = vi.mocked(reviewTemplateApi.activateReviewTemplate);
const mockedSoftDeleteDraftReviewTemplate = vi.mocked(
  reviewTemplateApi.softDeleteDraftReviewTemplate,
);

const TEMPLATE_ID = 'template-1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/review-templates/${TEMPLATE_ID}`]}>
      <Routes>
        <Route path="/review-templates/:templateId" element={<ReviewTemplateDetailPage />} />
        <Route
          path="/review-templates"
          element={<div data-testid="review-template-list-sentinel" />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const draftTemplate = {
  id: TEMPLATE_ID,
  elementType: 'EXTINGUISHER' as const,
  frequency: 'ANNUAL' as const,
  name: 'Annual extinguisher check',
  version: null,
  status: 'draft' as const,
  questions: [{ questionId: 'question-1', order: 1, text: 'Check the pressure gauge' }],
};

const activeTemplate = {
  id: TEMPLATE_ID,
  elementType: 'EXTINGUISHER' as const,
  frequency: 'ANNUAL' as const,
  name: 'Annual extinguisher check',
  version: 1,
  status: 'active' as const,
  questions: [{ questionId: 'question-1', order: 1, text: 'Frozen wording' }],
};

const annualQuestion = {
  id: 'question-2',
  elementType: 'EXTINGUISHER' as const,
  frequencies: ['ANNUAL' as const],
  text: 'Check the hose',
};

const quarterlyOnlyQuestion = {
  id: 'question-3',
  elementType: 'EXTINGUISHER' as const,
  frequencies: ['QUARTERLY' as const],
  text: 'Check the seal',
};

describe('ReviewTemplateDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while the template request is in flight', () => {
    mockedReadReviewTemplate.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('review-template-detail-loading')).toBeInTheDocument();
  });

  it('shows a not-found state on a 404', async () => {
    mockedReadReviewTemplate.mockRejectedValue(new ApiError(404, 'REVIEW_TEMPLATE_NOT_FOUND'));

    renderPage();

    expect(await screen.findByTestId('review-template-detail-not-found')).toBeInTheDocument();
  });

  describe('frozen (active/retired) template', () => {
    it('renders no picker, reorder, rename or re-activate control, and no delete control (spec: No editing controls on a frozen version / No delete control on frozen versions)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(activeTemplate);

      renderPage();

      await screen.findByTestId('review-template-detail-question-question-1');
      expect(screen.queryByTestId('review-template-detail-picker')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('review-template-detail-question-up-question-1'),
      ).not.toBeInTheDocument();
      expect(screen.queryByTestId('review-template-detail-save')).not.toBeInTheDocument();
      expect(screen.queryByTestId('review-template-detail-activate')).not.toBeInTheDocument();
      expect(screen.queryByTestId('review-template-detail-delete')).not.toBeInTheDocument();
      expect(mockedListChecklistQuestions).not.toHaveBeenCalled();
    });

    it('renders the frozen snapshot wording, not the live pool text', async () => {
      mockedReadReviewTemplate.mockResolvedValue(activeTemplate);

      renderPage();

      const row = await screen.findByTestId('review-template-detail-question-question-1');
      expect(row).toHaveTextContent('Frozen wording');
    });
  });

  describe('draft template', () => {
    it('shows the picker pre-filtered by the template frequency, revealed by the "show all" toggle (spec: Frequency pre-filter is a default, not a lock)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([annualQuestion, quarterlyOnlyQuestion]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      await screen.findByTestId('review-template-detail-picker-item-question-2');
      expect(
        screen.queryByTestId('review-template-detail-picker-item-question-3'),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('review-template-detail-show-all-frequencies'));

      expect(
        await screen.findByTestId('review-template-detail-picker-item-question-3'),
      ).toBeInTheDocument();
    });

    it('shows a distinct empty-pool state pointing to the question pool (spec: Empty-pool state in the builder)', async () => {
      mockedReadReviewTemplate.mockResolvedValue({ ...draftTemplate, questions: [] });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('review-template-detail-pool-empty')).toBeInTheDocument();
    });

    it('adds a question from the picker, saves the ordered selection, and reflects it without a manual reload (spec: Admin builds and reorders a draft)', async () => {
      mockedReadReviewTemplate.mockResolvedValue({ ...draftTemplate, questions: [] });
      mockedListChecklistQuestions.mockResolvedValue([annualQuestion]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedSetReviewTemplateQuestions.mockResolvedValue({
        ...draftTemplate,
        questions: [{ questionId: annualQuestion.id, order: 1, text: annualQuestion.text }],
      });

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-picker-add-question-2'));
      fireEvent.click(screen.getByTestId('review-template-detail-save'));

      await waitFor(() =>
        expect(mockedSetReviewTemplateQuestions).toHaveBeenCalledWith(TEMPLATE_ID, ['question-2']),
      );
      expect(
        await screen.findByTestId('review-template-detail-question-question-2'),
      ).toBeInTheDocument();
    });

    it('reorders selected questions with the up/down controls before saving (spec: Admin builds and reorders a draft)', async () => {
      mockedReadReviewTemplate.mockResolvedValue({
        ...draftTemplate,
        questions: [
          { questionId: 'question-1', order: 1, text: 'Check the pressure gauge' },
          { questionId: 'question-2', order: 2, text: 'Check the hose' },
        ],
      });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedSetReviewTemplateQuestions.mockResolvedValue(draftTemplate);

      renderPage();

      await screen.findByTestId('review-template-detail-question-question-1');
      fireEvent.click(screen.getByTestId('review-template-detail-question-down-question-1'));
      fireEvent.click(screen.getByTestId('review-template-detail-save'));

      await waitFor(() =>
        expect(mockedSetReviewTemplateQuestions).toHaveBeenCalledWith(TEMPLATE_ID, [
          'question-2',
          'question-1',
        ]),
      );
    });

    it('names the currently active version in the activate confirmation (spec: Confirmation names the version being retired)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([
        {
          id: 'template-0',
          elementType: 'EXTINGUISHER',
          frequency: 'ANNUAL',
          name: 'Previous version',
          version: 1,
          status: 'active',
        },
      ]);

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog).toHaveTextContent('Version 1');
      expect(dialog.textContent).toMatch(/permanent/i);
    });

    it('omits any retirement claim on a first activation (spec: Confirmation on a first activation omits any retirement claim)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog).not.toHaveTextContent(/retired/i);
    });

    it('does not activate until the confirmation is explicitly confirmed (spec: Activation requires confirmation)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));

      expect(mockedActivateReviewTemplate).not.toHaveBeenCalled();
    });

    it('styles the activate confirmation as primary and the delete one as danger', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveClass('sf-btn', 'sf-btn-primary');
      fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

      fireEvent.click(screen.getByTestId('review-template-detail-delete'));
      expect(screen.getByTestId('confirm-dialog-confirm')).toHaveClass('sf-btn', 'sf-btn-danger');
    });

    it('activates on confirmation and refreshes to the frozen render (spec: Successful activation updates both versions in the list)', async () => {
      mockedReadReviewTemplate.mockResolvedValueOnce(draftTemplate).mockResolvedValueOnce({
        ...activeTemplate,
        version: 2,
      });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedActivateReviewTemplate.mockResolvedValue({
        id: TEMPLATE_ID,
        status: 'active',
        version: 2,
      });

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => expect(mockedActivateReviewTemplate).toHaveBeenCalledWith(TEMPLATE_ID));
      expect(await screen.findByTestId('review-template-detail-status')).toHaveTextContent(
        'Active',
      );
    });

    it('shows a specific message on a 409 REVIEW_TEMPLATE_EMPTY activation rejection (spec: Empty-template rejection is explained specifically)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedActivateReviewTemplate.mockRejectedValue(new ApiError(409, 'REVIEW_TEMPLATE_EMPTY'));

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      const error = await screen.findByTestId('review-template-detail-activate-error');
      expect(error).toHaveTextContent('Add at least one question before activating.');
    });

    it('requires confirmation before soft-deleting a draft (spec: Confirmed draft delete removes it from the list)', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedSoftDeleteDraftReviewTemplate.mockResolvedValue(undefined);

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-delete'));
      expect(mockedSoftDeleteDraftReviewTemplate).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() =>
        expect(mockedSoftDeleteDraftReviewTemplate).toHaveBeenCalledWith(TEMPLATE_ID),
      );
      expect(await screen.findByTestId('review-template-list-sentinel')).toBeInTheDocument();
    });
  });

  describe('design system', () => {
    it('renders the loading, not-found and error states in empty-state boxes under a page header', async () => {
      mockedReadReviewTemplate.mockReturnValue(new Promise(() => {}));
      const { unmount } = renderPage();
      expect(screen.getByTestId('review-template-detail-loading')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      unmount();

      mockedReadReviewTemplate.mockRejectedValue(new ApiError(404));
      const notFound = renderPage();
      expect(await screen.findByTestId('review-template-detail-not-found')).toHaveClass('sf-empty');
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
      notFound.unmount();

      mockedReadReviewTemplate.mockRejectedValue(new ApiError(500));
      renderPage();
      expect(await screen.findByTestId('review-template-detail-error-state')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('sf-page-header');
    });

    it('puts Activate (primary) and Delete draft (danger) in the page header', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      const activate = await screen.findByTestId('review-template-detail-activate');
      const remove = screen.getByTestId('review-template-detail-delete');
      expect(activate).toHaveClass('sf-btn', 'sf-btn-primary');
      expect(remove).toHaveClass('sf-btn', 'sf-btn-danger');
      expect(activate.parentElement).toHaveClass('sf-actions');
      expect(remove.parentElement).toBe(activate.parentElement);
      expect(activate.closest('.sf-page-header')).toBe(
        screen.getByRole('heading', { level: 1 }).parentElement,
      );
    });

    it('shows the fields as a detail list in a panel, the version as data and the draft status as a draft badge', async () => {
      mockedReadReviewTemplate.mockResolvedValue({ ...draftTemplate, version: 2 });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      const name = await screen.findByTestId('review-template-detail-name');
      expect(name.closest('dl')?.parentElement).toHaveClass('sf-panel');
      expect(screen.getByTestId('review-template-detail-version')).toHaveClass('sf-data');
      expect(
        within(screen.getByTestId('review-template-detail-status')).getByText('Draft'),
      ).toHaveClass('sf-badge', 'sf-badge-draft');
    });

    it('shows an active status as a success badge and a retired one as a plain badge', async () => {
      mockedReadReviewTemplate.mockResolvedValue(activeTemplate);
      const active = renderPage();
      const activeBadge = within(
        await screen.findByTestId('review-template-detail-status'),
      ).getByText('Active');
      expect(activeBadge).toHaveClass('sf-badge', 'sf-badge-success');
      active.unmount();

      mockedReadReviewTemplate.mockResolvedValue({ ...activeTemplate, status: 'retired' as const });
      renderPage();
      const retiredBadge = within(
        await screen.findByTestId('review-template-detail-status'),
      ).getByText('Retired');
      expect(retiredBadge).toHaveClass('sf-badge');
      expect(retiredBadge).not.toHaveClass('sf-badge-success');
      expect(retiredBadge).not.toHaveClass('sf-badge-draft');
    });

    it('renders the selected questions as a stack of panels with ghost reorder and remove controls', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      const question = await screen.findByTestId('review-template-detail-question-question-1');
      expect(question).toHaveClass('sf-panel');
      expect(question.parentElement).toHaveClass('sf-stack');
      expect(screen.getByTestId('review-template-detail-questions')).toHaveClass('sf-section');
      for (const control of ['up', 'down', 'remove']) {
        const button = screen.getByTestId(`review-template-detail-question-${control}-question-1`);
        expect(button).toHaveClass('sf-btn', 'sf-btn-ghost');
        expect(button.parentElement).toHaveClass('sf-actions');
      }
    });

    it('renders the empty selection and empty pool states in empty-state boxes', async () => {
      mockedReadReviewTemplate.mockResolvedValue({ ...draftTemplate, questions: [] });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      expect(await screen.findByTestId('review-template-detail-pool-empty')).toHaveClass(
        'sf-empty',
      );
      expect(screen.getByTestId('review-template-detail-questions-empty')).toHaveClass('sf-empty');
    });

    it('renders the picker as a section with a stack of panels, secondary Add and Save buttons', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([annualQuestion]);
      mockedListReviewTemplates.mockResolvedValue([]);

      renderPage();

      const item = await screen.findByTestId('review-template-detail-picker-item-question-2');
      expect(item).toHaveClass('sf-panel');
      expect(item.parentElement).toHaveClass('sf-stack');
      expect(screen.getByTestId('review-template-detail-picker')).toHaveClass('sf-section');
      const add = screen.getByTestId('review-template-detail-picker-add-question-2');
      const save = screen.getByTestId('review-template-detail-save');
      for (const button of [add, save]) {
        expect(button).toHaveClass('sf-btn');
        expect(button).not.toHaveClass('sf-btn-primary');
      }
    });

    it('shows save, activate and delete failures as danger alerts', async () => {
      mockedReadReviewTemplate.mockResolvedValue(draftTemplate);
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedSetReviewTemplateQuestions.mockRejectedValue(new ApiError(500));
      mockedActivateReviewTemplate.mockRejectedValue(new ApiError(500));
      mockedSoftDeleteDraftReviewTemplate.mockRejectedValue(new ApiError(500));

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-save'));
      fireEvent.click(screen.getByTestId('review-template-detail-activate'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
      fireEvent.click(screen.getByTestId('review-template-detail-delete'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      for (const action of ['save', 'activate', 'delete']) {
        const error = await screen.findByTestId(`review-template-detail-${action}-error`);
        expect(error).toHaveClass('sf-alert', 'sf-alert-danger');
        expect(error).toHaveAttribute('role', 'alert');
      }
    });
  });
});
