import { describe, expect, it } from 'vitest';
import { runParticleCompute } from '@mudah-cli/vgpu';

describe('runParticleCompute', () => {
  it('integrates positions with Euler + gravity (software compute pass)', () => {
    const positions = Float32Array.of(0, 0, 1, 1);
    const velocities = Float32Array.of(2, 0, 0, 3);
    const result = runParticleCompute({
      count: 2,
      dt: 0.5,
      positions,
      velocities,
      gravity: 4,
    });
    expect([...result.positions]).toEqual([1, 1, 1, 3.5]);
    expect([...result.velocities]).toEqual([2, 2, 0, 5]);
  });

  it('seeds positions when omitted', () => {
    const result = runParticleCompute({ count: 4, dt: 0 });
    expect(result.positions.length).toBe(8);
    expect(result.positions[0]).not.toBe(result.positions[2]);
  });
});
