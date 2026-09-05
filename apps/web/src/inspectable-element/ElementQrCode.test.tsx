import { render } from '@testing-library/react';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { ElementQrCode } from './ElementQrCode';

// design.md Testing Strategy, "Unit (web) | QR output": read <rect>s from
// the DOM, rebuild the boolean matrix, rasterize to an ImageData-shaped
// buffer, and let jsQR decode it — asserting the rendered *output*, not the
// `code` input, and specifically that it decodes to the bare code (not a
// URL, per the addendum's docs-correction rationale).
const QUIET_ZONE_MODULES = 4;
const PIXELS_PER_MODULE = 4;

function decodeRenderedQrCode(container: HTMLElement): string | null {
  const svg = container.querySelector('svg');
  if (!svg) {
    throw new Error('expected ElementQrCode to render an <svg>');
  }

  const viewBox = svg.getAttribute('viewBox') ?? '';
  const size = Number(viewBox.split(' ')[2]);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(`could not read a module size from viewBox "${viewBox}"`);
  }

  const darkModules = new Set<string>();
  svg.querySelectorAll('rect').forEach((rect) => {
    const x = Number(rect.getAttribute('x'));
    const y = Number(rect.getAttribute('y'));
    darkModules.add(`${x},${y}`);
  });

  const gridModules = size + QUIET_ZONE_MODULES * 2;
  const pixelsPerSide = gridModules * PIXELS_PER_MODULE;
  const data = new Uint8ClampedArray(pixelsPerSide * pixelsPerSide * 4).fill(255);

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!darkModules.has(`${col},${row}`)) {
        continue;
      }

      const startX = (col + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;
      const startY = (row + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;
      for (let dy = 0; dy < PIXELS_PER_MODULE; dy++) {
        for (let dx = 0; dx < PIXELS_PER_MODULE; dx++) {
          const idx = ((startY + dy) * pixelsPerSide + (startX + dx)) * 4;
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 255;
        }
      }
    }
  }

  const result = jsQR(data, pixelsPerSide, pixelsPerSide);
  return result?.data ?? null;
}

describe('ElementQrCode', () => {
  it('decodes to the exact code, not a URL', () => {
    const { container } = render(<ElementQrCode code="23456789AB" />);

    expect(decodeRenderedQrCode(container)).toBe('23456789AB');
  });

  it('decodes a second, different code correctly (triangulation)', () => {
    const { container } = render(<ElementQrCode code="ZYXWVUTSRQ" />);

    expect(decodeRenderedQrCode(container)).toBe('ZYXWVUTSRQ');
  });
});
