import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import * as qrReader from './qr-reader';
import { ScanCodeDialog } from './ScanCodeDialog';

vi.mock('./qr-reader', async (importOriginal) => {
  const actual = await importOriginal<typeof qrReader>();
  return { ...actual, createQrReader: vi.fn() };
});

const mockedCreateReader = vi.mocked(qrReader.createQrReader);

type FakeTrack = { stop: ReturnType<typeof vi.fn> };

function fakeStream(): { stream: MediaStream; track: FakeTrack } {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

let getUserMedia: ReturnType<typeof vi.fn>;

function renderDialog(open = true) {
  const onDetected = vi.fn();
  const onClose = vi.fn();
  const view = render(<ScanCodeDialog open={open} onDetected={onDetected} onClose={onClose} />);
  return { onDetected, onClose, view };
}

describe('ScanCodeDialog (EN-163)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await i18n.changeLanguage('en');
    getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the rear camera, reads a QR code, stops the camera and reports the code', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    const read = vi.fn().mockResolvedValueOnce(null).mockResolvedValue('AB12CD34EF');
    mockedCreateReader.mockResolvedValue({ read });

    const { onDetected, onClose } = renderDialog();

    expect(screen.getByRole('dialog', { name: 'Scan element code' })).toBeInTheDocument();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith('AB12CD34EF'));
    expect(read).toHaveBeenCalledWith(screen.getByTestId('scan-code-video'));
    expect(track.stop).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a message when the camera is denied, and closes from it', async () => {
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    mockedCreateReader.mockResolvedValue({ read: vi.fn() });

    const { onDetected, onClose } = renderDialog();

    expect(await screen.findByTestId('scan-code-error')).toHaveTextContent(
      'The camera could not be used. Type the code instead.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('shows the same message and stops the camera when the reader cannot load', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    mockedCreateReader.mockRejectedValue(new Error('wasm failed'));

    renderDialog();

    expect(await screen.findByTestId('scan-code-error')).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops the camera when cancelled, without reporting a code', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    mockedCreateReader.mockResolvedValue({ read: vi.fn().mockResolvedValue(null) });

    const { onDetected, onClose } = renderDialog();
    await waitFor(() => expect(mockedCreateReader).toHaveBeenCalled());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(track.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('does not report a code read that finishes after a cancel', async () => {
    const { stream } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    let finishRead: (value: string) => void = () => undefined;
    const read = vi.fn().mockReturnValue(new Promise<string>((resolve) => (finishRead = resolve)));
    mockedCreateReader.mockResolvedValue({ read });

    const { onDetected, onClose } = renderDialog();
    await waitFor(() => expect(read).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      finishRead('AB12CD34EF');
    });

    expect(onClose).toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('stops the camera when the dialog is cancelled with Esc or the back gesture', async () => {
    const { stream, track } = fakeStream();
    getUserMedia.mockResolvedValue(stream);
    mockedCreateReader.mockResolvedValue({ read: vi.fn().mockResolvedValue(null) });

    const { onDetected, onClose } = renderDialog();
    await waitFor(() => expect(mockedCreateReader).toHaveBeenCalled());

    fireEvent(screen.getByTestId('scan-code-dialog'), new Event('cancel'));

    expect(track.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('stops a camera that starts after the dialog was closed', async () => {
    const { stream, track } = fakeStream();
    let grant: (value: MediaStream) => void = () => undefined;
    getUserMedia.mockReturnValue(new Promise((resolve) => (grant = resolve)));
    mockedCreateReader.mockResolvedValue({ read: vi.fn().mockResolvedValue('AB12CD34EF') });

    const { onDetected, view } = renderDialog();
    view.rerender(<ScanCodeDialog open={false} onDetected={onDetected} onClose={vi.fn()} />);
    await act(async () => {
      grant(stream);
    });

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(onDetected).not.toHaveBeenCalled();
  });

  it('does not open the camera while closed', () => {
    renderDialog(false);

    expect(getUserMedia).not.toHaveBeenCalled();
  });
});
