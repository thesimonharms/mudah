import { describe, expect, it } from 'vitest';
import { resolveWgsl } from '@mudah-cli/vgpu';

describe('resolveWgsl', () => {
  it('expands #include and // @import', () => {
    const files: Record<string, string> = {
      '/lib/color.wgsl': 'fn tint() -> f32 { return 1.0; }',
      '/lib/noise.wgsl': 'fn n() -> f32 { return 0.0; }',
    };
    const source = `#include "color.wgsl"
// @import noise
@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1.0); }`;
    const resolved = resolveWgsl(source, {
      baseDir: '/lib',
      readFile: (path) => {
        const body = files[path];
        if (body === undefined) throw new Error(`missing ${path}`);
        return body;
      },
    });
    expect(resolved).toContain('fn tint()');
    expect(resolved).toContain('fn n()');
    expect(resolved).toContain('@fragment');
  });

  it('detects include cycles', () => {
    const files: Record<string, string> = {
      '/a.wgsl': '#include "b.wgsl"',
      '/b.wgsl': '#include "a.wgsl"',
    };
    expect(() =>
      resolveWgsl('#include "a.wgsl"', {
        baseDir: '/',
        readFile: (path) => files[path] ?? '',
      }),
    ).toThrow(/Circular/);
  });
});
