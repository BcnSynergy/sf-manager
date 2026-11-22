import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressPhoto, PHOTO_JPEG_QUALITY, PHOTO_MAX_EDGE_PX } from './compress-photo';

// jsdom has no image decoding or canvas, so both are stubbed: the test pins
// what compressPhoto asks of them (orientation applied, size, JPEG at 0.8).
describe('compressPhoto', () => {
  const drawImage = vi.fn();
  const toBlob = vi.fn();
  const close = vi.fn();
  let canvas: { width: number; height: number; getContext: () => unknown; toBlob: typeof toBlob };

  function stubBitmap(width: number, height: number) {
    const createImageBitmap = vi.fn().mockResolvedValue({ width, height, close });
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    return createImageBitmap;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toBlob };
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas' ? (canvas as unknown as HTMLCanvasElement) : realCreate(tag),
    );
    toBlob.mockImplementation((callback: (blob: Blob | null) => void) =>
      callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales the long side down to 1600 px and encodes JPEG at quality 0.8', async () => {
    const create = stubBitmap(4000, 3000);
    const file = new Blob(['raw']);

    const result = await compressPhoto(file);

    expect(create).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
    expect(PHOTO_MAX_EDGE_PX).toBe(1600);
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.8);
    expect(PHOTO_JPEG_QUALITY).toBe(0.8);
    expect(result.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalled();
  });

  it('scales a portrait photo by its height', async () => {
    stubBitmap(3000, 4000);
    await compressPhoto(new Blob(['raw']));
    expect([canvas.width, canvas.height]).toEqual([1200, 1600]);
  });

  it('never enlarges a photo already within the limit', async () => {
    stubBitmap(800, 600);
    await compressPhoto(new Blob(['raw']));
    expect([canvas.width, canvas.height]).toEqual([800, 600]);
  });

  it('rejects when the browser cannot encode the result', async () => {
    stubBitmap(800, 600);
    toBlob.mockImplementation((callback: (blob: Blob | null) => void) => callback(null));
    await expect(compressPhoto(new Blob(['raw']))).rejects.toThrow('JPEG encoding failed');
    expect(close).toHaveBeenCalled();
  });

  it('rejects when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
    await expect(compressPhoto(new Blob(['raw']))).rejects.toThrow('decode');
  });
});
