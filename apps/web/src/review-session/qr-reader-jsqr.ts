import jsQR from 'jsqr';
import type { QrReader } from './qr-reader';

// Frames are read at most this many pixels on their longer side: enough for
// a label held in front of the camera, and it keeps each read fast.
const MAX_SIDE = 640;

// EN-163: the QR reader for browsers without a native QR BarcodeDetector
// (Firefox, Safari, every iOS browser). jsQR is plain JavaScript, so it runs
// under the production Content Security Policy, which allows no WebAssembly.
// Only qr-reader.ts imports this module, dynamically, so it loads only when
// Scan is used.
export function createJsqrReader(): QrReader {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return {
    async read(video) {
      const { videoWidth, videoHeight } = video;
      if (!context || videoWidth === 0 || videoHeight === 0) {
        return null;
      }
      const scale = Math.min(1, MAX_SIDE / Math.max(videoWidth, videoHeight));
      canvas.width = Math.round(videoWidth * scale);
      canvas.height = Math.round(videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(frame.data, frame.width, frame.height, {
        inversionAttempts: 'dontInvert',
      });
      return code && code.data !== '' ? code.data : null;
    },
  };
}
