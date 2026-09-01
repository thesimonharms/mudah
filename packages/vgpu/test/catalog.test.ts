import { describe, expect, it } from 'vitest';
import { SHADER_CATALOG, getShader, listShaders } from '@mudah-cli/vgpu';

describe('shader catalog', () => {
  it('ships plasma, metaballs, fire, and Voronoi', () => {
    expect(listShaders()).toEqual(['plasma', 'metaballs', 'fire', 'voronoi']);
    for (const name of listShaders()) {
      const source = SHADER_CATALOG[name] ?? '';
      expect(source).toContain('@fragment');
      expect(source).toContain('fn fs_main');
    }
    expect(getShader('Voronoi')).toBe(SHADER_CATALOG['voronoi']);
    expect(getShader('metaball')).toContain('fs_main');
  });

  it('rejects unknown names', () => {
    expect(() => getShader('aurora')).toThrow(/plasma/);
  });
});
