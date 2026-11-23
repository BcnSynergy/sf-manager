import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createQrReader } from './qr-reader';

// How often a video frame is read while scanning.
const READ_INTERVAL_MS = 250;

type Props = {
  open: boolean;
  // Called once with the text of the QR code read; the camera is already
  // stopped. The caller closes the dialog.
  onDetected: (code: string) => void;
  onClose: () => void;
};

type ScanState = 'starting' | 'scanning' | 'error';

// EN-163 (review-session-ui "Code Entry, Typed or Scanned"): a native
// <dialog> showing the rear camera until a QR code is read. The camera is
// stopped whenever the dialog closes, unmounts or a code is read, including
// a camera that is granted only after the dialog was closed. A denied or
// failing camera, or a reader that cannot load, shows one message; typed
// entry on the page stays available. The caller mounts it for one scan, so
// each scan starts in the 'starting' state.
export function ScanCodeDialog({ open, onDetected, onClose }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleId = useId();
  const [state, setState] = useState<ScanState>('starting');
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  // Stops the running scan (camera and frame reads); set while one runs.
  const stopScanRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function stopCamera() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    async function start() {
      try {
        const granted = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        });
        stream = granted;
        if (!active) {
          stopCamera();
          return;
        }
        const reader = await createQrReader();
        const video = videoRef.current;
        if (!active || !video) {
          stopCamera();
          return;
        }
        video.srcObject = granted;
        await video.play();
        if (!active) {
          return;
        }
        setState('scanning');

        const readFrame = async () => {
          if (!active) {
            return;
          }
          let code: string | null = null;
          try {
            code = await reader.read(video);
          } catch {
            // A frame that cannot be read yet (for example before the video
            // has data) is skipped; the next one is tried.
          }
          if (!active) {
            return;
          }
          if (code !== null) {
            active = false;
            stopCamera();
            onDetectedRef.current(code);
            return;
          }
          timer = setTimeout(() => void readFrame(), READ_INTERVAL_MS);
        };
        void readFrame();
      } catch {
        stopCamera();
        if (active) {
          setState('error');
        }
      }
    }

    function stopScan() {
      active = false;
      clearTimeout(timer);
      stopCamera();
    }

    stopScanRef.current = stopScan;
    void start();
    return stopScan;
  }, [open]);

  // Cancel (button or Esc) stops the camera at once, not only when the
  // caller closes the dialog.
  function handleCancel() {
    stopScanRef.current();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="sf-dialog"
      aria-labelledby={titleId}
      data-testid="scan-code-dialog"
      onCancel={handleCancel}
    >
      <h2 id={titleId} className="sf-dialog-title">
        {t('reviewSession.detail.scanTitle')}
      </h2>
      {state === 'error' ? (
        <p role="alert" data-testid="scan-code-error">
          {t('reviewSession.detail.scanError')}
        </p>
      ) : (
        <>
          <p>{t('reviewSession.detail.scanHint')}</p>
          <video
            ref={videoRef}
            className="sf-scan-video"
            muted
            playsInline
            data-testid="scan-code-video"
          />
        </>
      )}
      <div className="sf-actions">
        <button
          type="button"
          className="sf-btn sf-btn-ghost"
          onClick={handleCancel}
          data-testid="scan-code-cancel"
        >
          {t('common.cancel')}
        </button>
      </div>
    </dialog>
  );
}
