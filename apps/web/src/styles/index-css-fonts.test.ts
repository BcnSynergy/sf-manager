import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// web-visual-foundation spec "Fonts Load From the App's Own Origin". Same
// process.cwd() approach as check-app-nav-print-suppression.test.ts (see its
// header and EN-50): Vitest's working directory for this workspace is apps/web.
const SRC = join(process.cwd(), 'src');
const cssSource = readFileSync(join(SRC, 'index.css'), 'utf8');

function fontFaces(css: string): string[] {
  return css.match(/@font-face\s*{[^}]*}/g) ?? [];
}

describe('index.css fonts', () => {
  it('references no URL on another origin', () => {
    expect(cssSource).not.toMatch(/url\(\s*['"]?(https?:)?\/\//i);
    expect(cssSource).not.toMatch(/@import/i);
  });

  it.each(['Montserrat', 'Public Sans', 'IBM Plex Mono'])(
    'declares %s from the committed font files, Latin and Latin Extended',
    (family) => {
      const faces = fontFaces(cssSource).filter((face) => face.includes(`'${family}'`));
      expect(faces).toHaveLength(2);
      for (const face of faces) {
        const url = /url\('\.\/(assets\/fonts\/[^']+\.woff2)'\)/.exec(face)?.[1];
        expect(url).toBeDefined();
        expect(existsSync(join(SRC, url!))).toBe(true);
        expect(face).toMatch(/unicode-range:/);
        expect(face).toMatch(/font-display:\s*swap/);
      }
    },
  );
});
