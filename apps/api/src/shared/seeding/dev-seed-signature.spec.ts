import { detectSignatureFormat } from '../../modules/reviewer-signature/domain/reviewer-signature';
import { buildDevSignaturePng } from './dev-seed-signature';

describe('buildDevSignaturePng', () => {
  it('is a PNG of 200x60 that the signature upload rules accept, well under 2 MiB', () => {
    const png = buildDevSignaturePng();

    expect(detectSignatureFormat(png)).toEqual({
      extension: 'png',
      contentType: 'image/png',
    });
    expect(png.readUInt32BE(16)).toBe(200);
    expect(png.readUInt32BE(20)).toBe(60);
    expect(png.length).toBeLessThan(10_000);
  });

  it('is the same bytes on every run', () => {
    expect(buildDevSignaturePng().equals(buildDevSignaturePng())).toBe(true);
  });
});
