import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ShaderSession, capturePng } from '@mudah-cli/vgpu';

const GRADIENT = `
  @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return vec4f(uv.x, uv.y, 0.25, 1.0);
  }
`;

describe('capturePng', () => {
  it('encodes RGBA as a valid PNG (IHDR + IDAT + IEND)', () => {
    const rgba = Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 255);
    const png = capturePng(rgba, 2, 1);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const ihdr = png.subarray(8, 8 + 8 + 13 + 4);
    expect(String.fromCharCode(...ihdr.subarray(4, 8))).toBe('IHDR');
    const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
    expect(view.getUint32(8, false)).toBe(2);
    expect(view.getUint32(12, false)).toBe(1);
    expect(ihdr[16]).toBe(8);
    expect(ihdr[17]).toBe(6);

    const idatStart = 8 + 8 + 13 + 4;
    expect(String.fromCharCode(...png.subarray(idatStart + 4, idatStart + 8))).toBe('IDAT');
    const idatLen = new DataView(png.buffer, png.byteOffset + idatStart, 4).getUint32(0, false);
    const compressed = png.subarray(idatStart + 8, idatStart + 8 + idatLen);
    const raw = inflateSync(compressed);
    expect(raw[0]).toBe(0);
    expect([...raw.subarray(1)]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);

    const iend = png.subarray(png.byteLength - 12);
    expect(String.fromCharCode(...iend.subarray(4, 8))).toBe('IEND');
  });

  it('captures a ShaderSession framebuffer', async () => {
    const session = await ShaderSession.create({
      shader: GRADIENT,
      width: 4,
      height: 4,
      adapter: 'mock',
      present: 'half',
      stdout: { write: () => {} },
    });
    try {
      await session.render();
      const png = await session.capturePng();
      expect(png[0]).toBe(0x89);
      expect(String.fromCharCode(png[1] ?? 0, png[2] ?? 0, png[3] ?? 0)).toBe('PNG');
    } finally {
      session.dispose();
    }
  });
});
