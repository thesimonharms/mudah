import { describe, expect, it } from 'vitest';
import { ShaderSession, bindAudioReactive } from '@mudah-cli/vgpu';

const GRADIENT = `
  @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
    return vec4f(uv.x, uv.y, 0.25, 1.0);
  }
`;

describe('bindAudioReactive', () => {
  it('writes energy/bass/mid/high through setUniforms', () => {
    const written: Record<string, unknown>[] = [];
    const session = {
      setUniforms(values: Record<string, unknown>): void {
        written.push(values);
      },
    };
    const bind = bindAudioReactive(session, {
      energy: () => 0.5,
      bands: () => [0.8, 0.4, 0.1],
    });
    expect(bind.sync()).toEqual({ energy: 0.5, bass: 0.8, mid: 0.4, high: 0.1 });
    expect(written[0]).toMatchObject({
      energy: 0.5,
      bass: 0.8,
      mid: 0.4,
      high: 0.1,
      params: { energy: 0.5, bass: 0.8, mid: 0.4, high: 0.1 },
    });
    bind.dispose();
    bind.sync();
    expect(written).toHaveLength(1);
  });

  it('drives a live ShaderSession', async () => {
    const session = await ShaderSession.create({
      shader: GRADIENT,
      width: 4,
      height: 4,
      adapter: 'mock',
      present: 'half',
      stdout: { write: () => {} },
    });
    try {
      const bind = bindAudioReactive(session, {
        energy: () => 0.25,
        bands: () => [0.1, 0.2, 0.3],
      });
      bind.sync();
      expect(session.uniforms()).toMatchObject({ energy: 0.25, bass: 0.1, mid: 0.2, high: 0.3 });
    } finally {
      session.dispose();
    }
  });
});
