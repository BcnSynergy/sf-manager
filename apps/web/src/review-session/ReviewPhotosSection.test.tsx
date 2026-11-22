import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { ApiError } from '../api/client';
import * as reviewPhotosApi from '../api/review-photos';
import * as compressModule from './compress-photo';
import { ReviewPhotosSection } from './ReviewPhotosSection';

vi.mock('../api/review-photos', async (importOriginal) => {
  const actual = await importOriginal<typeof reviewPhotosApi>();
  return {
    ...actual,
    listReviewPhotos: vi.fn(),
    uploadReviewPhoto: vi.fn(),
    deleteReviewPhoto: vi.fn(),
  };
});
vi.mock('./compress-photo', () => ({ compressPhoto: vi.fn() }));

const mockedList = vi.mocked(reviewPhotosApi.listReviewPhotos);
const mockedUpload = vi.mocked(reviewPhotosApi.uploadReviewPhoto);
const mockedDelete = vi.mocked(reviewPhotosApi.deleteReviewPhoto);
const mockedCompress = vi.mocked(compressModule.compressPhoto);

const SESSION_ID = 'session-1';
const ELEMENT_ID = 'element-1';

function photo(id: string) {
  return { id, createdAt: '2026-11-22T10:00:00.000Z' };
}

function renderSection(readOnly = false) {
  return render(
    <ReviewPhotosSection sessionId={SESSION_ID} elementId={ELEMENT_ID} readOnly={readOnly} />,
  );
}

function chooseFile() {
  const file = new File(['raw'], 'IMG_0001.HEIC', { type: 'image/heic' });
  fireEvent.change(screen.getByTestId('review-photos-input'), { target: { files: [file] } });
  return file;
}

describe('ReviewPhotosSection', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
  });

  it('lists the photos as thumbnails linking to the full photo', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    renderSection();

    const thumb = await screen.findByTestId('review-photo-p1');
    const url = reviewPhotosApi.reviewPhotoUrl(SESSION_ID, 'p1');
    expect(thumb).toHaveAttribute('src', url);
    expect(thumb).toHaveAttribute('alt', 'Photo 1');
    expect(screen.getByTestId('review-photo-link-p1')).toHaveAttribute('href', url);
    expect(screen.getByTestId('review-photo-p2')).toHaveAttribute('alt', 'Photo 2');
    expect(mockedList).toHaveBeenCalledWith(SESSION_ID, ELEMENT_ID);
  });

  it('shows an empty state, and a load error distinct from it', async () => {
    mockedList.mockResolvedValue([]);
    const { unmount } = renderSection();
    expect(await screen.findByTestId('review-photos-empty')).toHaveTextContent('No photos yet.');
    unmount();

    mockedList.mockRejectedValue(new ApiError(0));
    renderSection();
    expect(await screen.findByTestId('review-photos-load-error')).toBeInTheDocument();
    expect(screen.queryByTestId('review-photos-add')).not.toBeInTheDocument();
  });

  it('offers a camera-capable file input that accepts images', async () => {
    mockedList.mockResolvedValue([]);
    renderSection();

    await screen.findByTestId('review-photos-add');
    const input = screen.getByTestId('review-photos-input');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/*');
    expect(input).toHaveAttribute('capture', 'environment');
  });

  it('compresses the chosen photo, uploads the result and shows its thumbnail', async () => {
    mockedList.mockResolvedValue([]);
    const compressed = new Blob(['jpeg'], { type: 'image/jpeg' });
    mockedCompress.mockResolvedValue(compressed);
    mockedUpload.mockResolvedValue(photo('p-new'));
    renderSection();

    await screen.findByTestId('review-photos-add');
    const file = chooseFile();

    expect(await screen.findByTestId('review-photo-p-new')).toBeInTheDocument();
    expect(mockedCompress).toHaveBeenCalledWith(file);
    expect(mockedUpload).toHaveBeenCalledWith(SESSION_ID, ELEMENT_ID, compressed);
    expect(screen.queryByTestId('review-photos-empty')).not.toBeInTheDocument();
  });

  it('replaces Add photo with the limit hint once the element has 3 photos', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    mockedCompress.mockResolvedValue(new Blob(['jpeg']));
    mockedUpload.mockResolvedValue(photo('p3'));
    renderSection();

    await screen.findByTestId('review-photos-add');
    chooseFile();

    expect(await screen.findByTestId('review-photos-limit')).toHaveTextContent(
      'This element already has 3 photos, the maximum.',
    );
    expect(screen.queryByTestId('review-photos-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-photos-input')).not.toBeInTheDocument();
  });

  it('reports a photo the browser cannot read, without uploading', async () => {
    mockedList.mockResolvedValue([]);
    mockedCompress.mockRejectedValue(new Error('decode failed'));
    renderSection();

    await screen.findByTestId('review-photos-add');
    chooseFile();

    expect(await screen.findByTestId('review-photos-error')).toHaveTextContent(
      'This file could not be read as a photo.',
    );
    expect(mockedUpload).not.toHaveBeenCalled();
  });

  it.each([
    [new ApiError(409, 'REVIEW_PHOTO_LIMIT_REACHED'), 'maximum number of photos'],
    [new ApiError(413, 'REVIEW_PHOTO_TOO_LARGE'), 'too large to upload'],
    [new ApiError(409, 'REVIEW_SESSION_NOT_EDITABLE'), 'already completed'],
    [new ApiError(0), 'something went wrong'],
    [new ApiError(400, 'REVIEW_PHOTO_UNSUPPORTED_FORMAT'), 'could not be read as a photo'],
    [new ApiError(500), 'could not be uploaded'],
  ])('maps an upload rejection (%s) to its message', async (rejection, text) => {
    mockedList.mockResolvedValue([]);
    mockedCompress.mockResolvedValue(new Blob(['jpeg']));
    mockedUpload.mockRejectedValue(rejection);
    renderSection();

    await screen.findByTestId('review-photos-add');
    chooseFile();

    const alert = await screen.findByTestId('review-photos-error');
    expect(alert.textContent?.toLowerCase()).toContain(text.toLowerCase());
    expect(screen.getByTestId('review-photos-empty')).toBeInTheDocument();
  });

  it('removes a photo only after confirmation', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    mockedDelete.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByTestId('review-photo-remove-p1'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(mockedDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('review-photo-remove-p1'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(screen.queryByTestId('review-photo-p1')).not.toBeInTheDocument());
    expect(mockedDelete).toHaveBeenCalledWith(SESSION_ID, 'p1');
    expect(screen.getByTestId('review-photo-p2')).toBeInTheDocument();
  });

  it('keeps a photo whose removal fails, and drops one that no longer exists', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    mockedDelete.mockRejectedValueOnce(new ApiError(500));
    renderSection();

    fireEvent.click(await screen.findByTestId('review-photo-remove-p1'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(await screen.findByTestId('review-photos-error')).toHaveTextContent(
      'The photo could not be removed.',
    );
    expect(screen.getByTestId('review-photo-p1')).toBeInTheDocument();

    mockedDelete.mockRejectedValueOnce(new ApiError(404, 'REVIEW_PHOTO_NOT_FOUND'));
    fireEvent.click(screen.getByTestId('review-photo-remove-p2'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId('review-photo-p2')).not.toBeInTheDocument());
    expect(screen.getByTestId('review-photos-error')).toHaveTextContent(
      'This photo no longer exists.',
    );
  });

  it('read-only: shows the photos with no add or remove control', async () => {
    mockedList.mockResolvedValue([photo('p1')]);
    renderSection(true);

    expect(await screen.findByTestId('review-photo-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('review-photo-remove-p1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-photos-add')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-photos-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-photos-limit')).not.toBeInTheDocument();
  });

  it('disables Add and Remove and announces the upload while one is in flight', async () => {
    mockedList.mockResolvedValue([photo('p1')]);
    mockedCompress.mockResolvedValue(new Blob(['jpeg']));
    let finish: (value: ReturnType<typeof photo>) => void = () => undefined;
    mockedUpload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderSection();

    await screen.findByTestId('review-photos-add');
    chooseFile();

    const status = await screen.findByTestId('review-photos-uploading');
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByTestId('review-photos-add')).toBeDisabled();
    expect(screen.getByTestId('review-photo-remove-p1')).toBeDisabled();

    finish(photo('p2'));
    await screen.findByTestId('review-photo-p2');
    expect(screen.queryByTestId('review-photos-uploading')).not.toBeInTheDocument();
    expect(screen.getByTestId('review-photos-add')).toBeEnabled();
    expect(screen.getByTestId('review-photo-remove-p1')).toBeEnabled();
  });

  it('disables Add and Remove while a removal is in flight', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    let finish: () => void = () => undefined;
    mockedDelete.mockReturnValue(new Promise((resolve) => (finish = () => resolve(undefined))));
    renderSection();

    fireEvent.click(await screen.findByTestId('review-photo-remove-p1'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(screen.getByTestId('review-photos-add')).toBeDisabled());
    expect(screen.getByTestId('review-photo-remove-p2')).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.queryByTestId('review-photo-p1')).not.toBeInTheDocument());
    expect(screen.getByTestId('review-photos-add')).toBeEnabled();
  });

  it('clears the file input after each choice, so the same photo can be chosen again', async () => {
    mockedList.mockResolvedValue([]);
    mockedCompress.mockResolvedValue(new Blob(['jpeg']));
    mockedUpload.mockResolvedValue(photo('p1'));
    renderSection();

    await screen.findByTestId('review-photos-add');
    const input = screen.getByTestId('review-photos-input') as HTMLInputElement;
    const valueSetter = vi.spyOn(input, 'value', 'set');
    chooseFile();

    await screen.findByTestId('review-photo-p1');
    expect(valueSetter).toHaveBeenCalledWith('');
  });

  it('reads the list again after a limit rejection, so the limit note shows', async () => {
    mockedList.mockResolvedValueOnce([photo('p1'), photo('p2')]);
    mockedList.mockResolvedValueOnce([photo('p1'), photo('p2'), photo('p-other-tab')]);
    mockedCompress.mockResolvedValue(new Blob(['jpeg']));
    mockedUpload.mockRejectedValue(new ApiError(409, 'REVIEW_PHOTO_LIMIT_REACHED'));
    renderSection();

    await screen.findByTestId('review-photos-add');
    chooseFile();

    expect(await screen.findByTestId('review-photos-limit')).toBeInTheDocument();
    expect(screen.getByTestId('review-photo-p-other-tab')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('names each control by its photo number and moves focus to the heading after a removal', async () => {
    mockedList.mockResolvedValue([photo('p1'), photo('p2')]);
    mockedDelete.mockResolvedValue(undefined);
    renderSection();

    expect(await screen.findByRole('button', { name: 'Remove photo 2' })).toBe(
      screen.getByTestId('review-photo-remove-p2'),
    );
    expect(screen.getByRole('link', { name: 'Open photo 1 in a new tab' })).toBe(
      screen.getByTestId('review-photo-link-p1'),
    );

    fireEvent.click(screen.getByTestId('review-photo-remove-p1'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(screen.queryByTestId('review-photo-p1')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Photos' })).toHaveFocus();
  });
});
