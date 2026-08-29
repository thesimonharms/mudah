import { describe, expect, it } from 'vitest';
import { ShaderSession } from '@mudah-cli/vgpu';

const GRADIENT = `
  @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return vec4f(uv.x, uv.y, 0.25, 1.0);
  }
`;

const PARAMS = `
struct Params {
  time: f32,
  energy: f32,
  width: f32,
  height: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(params.energy, uv.x, 0.25, 1.0);
}
`;

describe('ShaderSession', () => {
  it('creates, draws, swaps shaders, and disposes through the mock adapter', async () => {
    const session = await ShaderSession.create({
      shader: GRADIENT,
      width: 8,
      height: 8,
      adapter: 'mock',
      present: 'half',
      stdout: { write: () => {} },
    });
    try {
      const pixels = await session.render();
      expect(pixels.byteLength).toBe(8 * 8 * 4);
      // vgpu/mock is an API stub: it does not rasterize, so bytes stay zero.
      session.useShader(PARAMS, { params: { time: 0, energy: 0, width: 8, height: 8 } });
      const again = await session.render();
      expect(again.byteLength).toBe(8 * 8 * 4);
    } finally {
      session.dispose();
    }
  });

  it('rasterizes a fragment shader when a Node GPU adapter is available', async () => {
    let session: ShaderSession;
    try {
      session = await ShaderSession.create({
        shader: PARAMS,
        width: 8,
        height: 8,
        adapter: 'auto',
        present: 'half',
        stdout: { write: () => {} },
        set: { params: { time: 0, energy: 1, width: 8, height: 8 } },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (/adapter|dawn|gpu|software-renderer/i.test(reason)) return;
      throw error;
    }
    try {
      const pixels = await session.render();
      expect(pixels.byteLength).toBe(8 * 8 * 4);
      expect(pixels[3]).toBe(255);
      expect(pixels[0] ?? 0).toBeGreaterThan(200);
    } finally {
      session.dispose();
    }
  });
});
