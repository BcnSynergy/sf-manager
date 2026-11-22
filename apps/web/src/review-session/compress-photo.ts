// EN-164 S2: before upload, a photo is resized to at most 1600 px on its long
// side and re-encoded as JPEG at quality 0.8. Drawing it on a canvas keeps
// only the pixels, so the EXIF metadata (GPS included) is dropped; the
// orientation is applied first, so the photo stays upright.
export const PHOTO_MAX_EDGE_PX = 1600;
export const PHOTO_JPEG_QUALITY = 0.8;

// Rejects when the browser cannot decode the file (for example a format it
// does not support) or cannot encode the result.
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, PHOTO_MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context unavailable');
    }
    context.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('JPEG encoding failed'))),
        'image/jpeg',
        PHOTO_JPEG_QUALITY,
      );
    });
  } finally {
    bitmap.close();
  }
}
