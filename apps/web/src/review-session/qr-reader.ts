// EN-163 (review-session-ui "Code Entry, Typed or Scanned"): reads an
// element's QR label from the camera's video. The browser's native
// BarcodeDetector is used when it reads QR codes (Chromium on Android, macOS,
// ChromeOS). Elsewhere (Firefox, Safari, every iOS browser) the jsQR reader
// is loaded on demand, in its own chunk from the app's own origin. jsQR is
// plain JavaScript: the production CSP allows no WebAssembly.

export type QrReader = {
  // The text of the first QR code in the current frame, or null.
  read(source: HTMLVideoElement): Promise<string | null>;
};

type Detector = {
  detect(source: HTMLVideoElement): Promise<ReadonlyArray<{ rawValue: string }>>;
};

type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<readonly string[]>;
};

const QR_FORMAT = 'qr_code';

// Scan is offered only where the browser can open a camera: getUserMedia
// exists only in a secure context (HTTPS or localhost).
export function canScan(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function createQrReader(): Promise<QrReader> {
  const Native = await nativeQrDetector();
  if (!Native) {
    const { createJsqrReader } = await import('./qr-reader-jsqr');
    return createJsqrReader();
  }
  const detector = new Native({ formats: [QR_FORMAT] });
  return {
    async read(source) {
      const found = await detector.detect(source);
      const value = found.find((code) => code.rawValue !== '')?.rawValue;
      return value ?? null;
    },
  };
}

async function nativeQrDetector(): Promise<DetectorClass | null> {
  const Native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Native) {
    return null;
  }
  try {
    const formats = await Native.getSupportedFormats();
    return formats.includes(QR_FORMAT) ? Native : null;
  } catch {
    return null;
  }
}
