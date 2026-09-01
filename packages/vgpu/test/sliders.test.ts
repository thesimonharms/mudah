import { describe, expect, it } from 'vitest';
import { ShaderSliders } from '@mudah-cli/vgpu';

describe('ShaderSliders', () => {
  it('clamps, snapshots, and renders a TUI overlay', () => {
    const sliders = new ShaderSliders(
      [
        { name: 'energy', min: 0, max: 1, value: 0.62 },
        { name: 'scale', min: 0, max: 1, value: 2 },
      ],
      { width: 6 },
    );
    expect(sliders.snapshot()).toEqual({ energy: 0.62, scale: 1 });
    sliders.set('energy', 0.25);
    expect(sliders.snapshot().energy).toBe(0.25);
    const lines = sliders.renderLines();
    expect(lines[0]).toBe('energy [██░░░░] 0.25');
    expect(lines[1]).toContain('scale');
    expect(lines[1]).toContain('1.00');
    expect(lines[1]).toContain('█');
  });

  it('rejects unknown names', () => {
    const sliders = new ShaderSliders([{ name: 'energy', min: 0, max: 1, value: 0 }]);
    expect(() => sliders.set('missing', 1)).toThrow(/missing/);
  });
});
