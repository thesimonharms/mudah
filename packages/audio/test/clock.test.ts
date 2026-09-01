import { describe, expect, it } from 'vitest';
import { BpmClock, quantize } from '@mudah-cli/audio';

describe('BpmClock', () => {
  it('exposes beat phase 0..1 and fires onBeat', () => {
    const clock = new BpmClock({ bpm: 60 });
    const beats: number[] = [];
    clock.onBeat((beat) => beats.push(beat));
    expect(clock.now()).toBe(0);
    clock.tick(500);
    expect(clock.now()).toBeCloseTo(0.5);
    expect(clock.beat).toBe(0);
    clock.tick(500);
    expect(clock.beat).toBe(1);
    expect(clock.now()).toBeCloseTo(0);
    expect(beats).toEqual([0, 1]);
  });
});

describe('quantize', () => {
  it('snaps to quarter and sixteenth grids', () => {
    expect(quantize(1.1, 60, 4)).toBe(1);
    expect(quantize(0.4, 60, 8)).toBe(0.5);
    expect(quantize(0.1, 120, 16)).toBeCloseTo(0.125);
  });
});
