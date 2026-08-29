import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  KittyGraphics,
  encodeHalfBlocks,
  encodeKittyDelete,
  encodeKittyImage,
} from '@mudah-cli/terminal';

describe('encodeKittyImage', () => {
  it('emits a single APC for a tiny RGB frame', () => {
    const pixels = Uint8Array.of(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255);
    const encoded = encodeKittyImage({
      pixels,
      width: 2,
      height: 2,
      format: 'rgb',
      compress: false,
      id: 7,
      placementId: 1,
    });
    expect(encoded.startsWith('\x1b_G')).toBe(true);
    expect(encoded.endsWith('\x1b\\')).toBe(true);
    expect(encoded).toContain('a=T');
    expect(encoded).toContain('f=24');
    expect(encoded).toContain('s=2');
    expect(encoded).toContain('v=2');
    expect(encoded).toContain('i=7');
    expect(encoded).toContain('p=1');
    expect(encoded).toContain('q=2');
    expect(encoded).toContain('C=1');
    expect(encoded).not.toContain('o=z');
    const payload = encoded.slice(encoded.indexOf(';') + 1, encoded.length - 2);
    expect(Buffer.from(payload, 'base64')).toEqual(Buffer.from(pixels));
  });

  it('compresses with zlib when asked', () => {
    const pixels = new Uint8Array(3 * 4 * 4);
    pixels.fill(128);
    const encoded = encodeKittyImage({
      pixels,
      width: 4,
      height: 4,
      format: 'rgb',
      compress: true,
    });
    expect(encoded).toContain('o=z');
    const payload = encoded.slice(encoded.indexOf(';') + 1, encoded.length - 2);
    expect(Buffer.from(payload, 'base64')).toEqual(deflateSync(pixels));
  });

  it('chunks payloads larger than 4096 base64 bytes', () => {
    const pixels = new Uint8Array(3 * 80 * 80);
    for (let i = 0; i < pixels.length; i++) pixels[i] = i % 256;
    const encoded = encodeKittyImage({
      pixels,
      width: 80,
      height: 80,
      format: 'rgb',
      compress: false,
    });
    const frames = encoded.split('\x1b_G').filter(Boolean);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).toContain('m=1');
    expect(frames.at(-1)).toContain('m=0');
  });

  it('rejects a short payload', () => {
    expect(() =>
      encodeKittyImage({ pixels: Uint8Array.of(1, 2), width: 2, height: 2, format: 'rgb' }),
    ).toThrow(/need 12/);
  });
});

describe('encodeKittyDelete', () => {
  it('deletes all placements', () => {
    expect(encodeKittyDelete('all')).toBe('\x1b_Ga=d,d=A,q=2;\x1b\\');
  });

  it('deletes one image id', () => {
    expect(encodeKittyDelete({ id: 3 })).toBe('\x1b_Ga=d,d=i,i=3,q=2;\x1b\\');
  });
});

describe('KittyGraphics', () => {
  it('writes a draw then a delete for the same id', () => {
    let out = '';
    const gfx = new KittyGraphics({ write: (data) => void (out += data) }, { id: 4 });
    gfx.draw(Uint8Array.of(0, 0, 0, 255), 1, 1, { format: 'rgba', compress: false });
    gfx.delete();
    expect(out).toContain('i=4');
    expect(out).toContain('a=T');
    expect(out).toContain('a=d,d=i,i=4');
  });
});

describe('encodeHalfBlocks', () => {
  it('packs two rows into one cell line', () => {
    // Top red, bottom blue.
    const pixels = Uint8Array.of(255, 0, 0, 255, 0, 0, 255, 0, 0, 255);
    const lines = encodeHalfBlocks(pixels, 1, 2, 'rgba');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('38;2;255;0;0');
    expect(lines[0]).toContain('48;2;0;0;255');
    expect(lines[0]).toContain('▀');
  });
});
