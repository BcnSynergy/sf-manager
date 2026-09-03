import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
        <Route path="/review-templates" element={<div data-testid="review-template-list-sentinel" />} />
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

    it('activates on confirmation and refreshes to the frozen render (spec: Successful activation updates both versions in the list)', async () => {
      mockedReadReviewTemplate.mockResolvedValueOnce(draftTemplate).mockResolvedValueOnce({
        ...activeTemplate,
        version: 2,
      });
      mockedListChecklistQuestions.mockResolvedValue([]);
      mockedListReviewTemplates.mockResolvedValue([]);
      mockedActivateReviewTemplate.mockResolvedValue({ id: TEMPLATE_ID, status: 'active', version: 2 });

      renderPage();

      fireEvent.click(await screen.findByTestId('review-template-detail-activate'));
      fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

      await waitFor(() => expect(mockedActivateReviewTemplate).toHaveBeenCalledWith(TEMPLATE_ID));
      expect(await screen.findByTestId('review-template-detail-status')).toHaveTextContent('Active');
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
});
