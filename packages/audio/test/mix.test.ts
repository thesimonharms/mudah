import { describe, expect, it } from 'vitest';
import { duck, mixChannels } from '@mudah-cli/audio';

describe('duck', () => {
  it('attenuates the target when the sidechain is loud', () => {
    const target = Float32Array.of(1, 1, 1);
    const quiet = duck(target, Float32Array.of(0, 0, 0), 1);
    expect([...quiet]).toEqual([1, 1, 1]);
    const silenced = duck(target, Float32Array.of(1, 1, 1), 1);
    expect([...silenced]).toEqual([0, 0, 0]);
    const half = duck(target, Float32Array.of(1, 1, 1), 0.5);
    expect(half[0]).toBeCloseTo(0.5);
  });
});

describe('mixChannels', () => {
  it('sums buffers and applies per-channel ducking', () => {
    const a = Float32Array.of(0.5, 0.5);
    const b = Float32Array.of(0.25, 0.25);
    expect([...mixChannels([a, b])]).toEqual([0.75, 0.75]);

    const ducked = mixChannels([Float32Array.of(1, 1), Float32Array.of(1, 1)], { duck: [1, 0] });
    expect(ducked[0]).toBeCloseTo(1);
  });
});
