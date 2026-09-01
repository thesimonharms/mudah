import { describe, expect, it } from 'vitest';
import { linear, easeIn, easeOut, easeInOut, bounce, elastic, tween, easings } from '@mudah-cli/animation';

describe('easing functions', () => {
  it('linear maps t to t', () => {
    expect(linear(0)).toBe(0);
    expect(linear(0.5)).toBe(0.5);
    expect(linear(1)).toBe(1);
  });

  it('easeIn is slower at start, faster at end', () => {
    expect(easeIn(0)).toBe(0);
    expect(easeIn(0.5)).toBeLessThan(0.5);
    expect(easeIn(1)).toBe(1);
  });

  it('easeOut is faster at start, slower at end', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(1)).toBe(1);
  });

  it('easeInOut is symmetric around 0.5', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(1)).toBe(1);
  });

  it('bounce returns 0 at 0 and 1 at 1', () => {
    expect(bounce(0)).toBe(0);
    expect(bounce(1)).toBe(1);
  });

  it('elastic returns 0 at 0 and 1 at 1', () => {
    expect(elastic(0)).toBe(0);
    expect(elastic(1)).toBe(1);
  });
});

describe('tween', () => {
  it('interpolates linearly between from and to', () => {
    expect(tween(0, 100, 0)).toBe(0);
    expect(tween(0, 100, 0.5)).toBe(50);
    expect(tween(0, 100, 1)).toBe(100);
  });

  it('uses a custom easing function', () => {
    const t0 = tween(0, 100, 0, (t) => t);
    const t1 = tween(0, 100, 0.5, (t) => t);
    expect(t0).toBe(0);
    expect(t1).toBe(50);
  });
});

describe('easings lookup', () => {
  it('exports all easing functions by name', () => {
    expect(Object.keys(easings)).toContain('linear');
    expect(Object.keys(easings)).toContain('bounce');
    expect(easings.linear(0.5)).toBe(0.5);
  });
});
