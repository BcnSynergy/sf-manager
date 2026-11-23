import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canScan, createQrReader } from './qr-reader';
import * as jsqrReader from './qr-reader-jsqr';

vi.mock('./qr-reader-jsqr', () => ({ createJsqrReader: vi.fn() }));

const mockedCreateJsqr = vi.mocked(jsqrReader.createJsqrReader);
const video = {} as HTMLVideoElement;

function detectorClass(formats: string[], found: Array<{ rawValue: string }>) {
  const detect = vi.fn().mockResolvedValue(found);
  const constructed: unknown[] = [];
  class FakeDetector {
    static getSupportedFormats = vi.fn().mockResolvedValue(formats);
    constructor(options: unknown) {
      constructed.push(options);
    }
    detect = detect;
  }
  return { FakeDetector, detect, constructed };
}

describe('qr-reader (EN-163)', () => {
  const original = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = original;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  describe('canScan', () => {
    it('is true when the browser can open a camera', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn() },
      });

      expect(canScan()).toBe(true);
    });

    it('is false without mediaDevices (for example over plain HTTP)', () => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });

      expect(canScan()).toBe(false);
    });
  });

  describe('createQrReader', () => {
    it('uses the native BarcodeDetector for QR codes when it reads them', async () => {
      const native = detectorClass(['ean_13', 'qr_code'], [{ rawValue: 'AB12CD34EF' }]);
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = native.FakeDetector;

      const reader = await createQrReader();

      expect(await reader.read(video)).toBe('AB12CD34EF');
      expect(native.detect).toHaveBeenCalledWith(video);
      expect(native.constructed).toEqual([{ formats: ['qr_code'] }]);
      expect(mockedCreateJsqr).not.toHaveBeenCalled();
    });

    it('loads the jsQR reader when the native one does not read QR codes', async () => {
      const native = detectorClass(['ean_13'], []);
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = native.FakeDetector;
      const fallback = { read: vi.fn().mockResolvedValue('JS98') };
      mockedCreateJsqr.mockReturnValue(fallback);

      const reader = await createQrReader();

      expect(reader).toBe(fallback);
      expect(native.constructed).toEqual([]);
    });

    it('loads the jsQR reader when the browser has no BarcodeDetector', async () => {
      delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector;
      const fallback = { read: vi.fn().mockResolvedValue(null) };
      mockedCreateJsqr.mockReturnValue(fallback);

      const reader = await createQrReader();

      expect(reader).toBe(fallback);
    });

    it('falls back to jsQR when the native format query fails', async () => {
      const native = detectorClass([], []);
      native.FakeDetector.getSupportedFormats.mockRejectedValue(new Error('no'));
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = native.FakeDetector;
      const fallback = { read: vi.fn() };
      mockedCreateJsqr.mockReturnValue(fallback);

      expect(await createQrReader()).toBe(fallback);
    });

    it('skips empty codes and returns the first one with text', async () => {
      const native = detectorClass(['qr_code'], [{ rawValue: '' }, { rawValue: 'SECOND' }]);
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = native.FakeDetector;

      const reader = await createQrReader();

      expect(await reader.read(video)).toBe('SECOND');
    });
  });
});
