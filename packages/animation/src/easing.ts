/**
 * Easing functions for spinners, transitions, and animations.
 * All return a value from 0..1 given `t` in 0..1.
 */
export type EasingFn = (t: number) => number;

/** Linear (no easing). */
export const linear: EasingFn = (t) => t;

/** Ease-in: slow start, fast end. */
export const easeIn: EasingFn = (t) => t * t;

/** Ease-out: fast start, slow end. */
export const easeOut: EasingFn = (t) => 1 - (1 - t) * (1 - t);

/** Ease-in-out: slow start and end, fast middle. */
export const easeInOut: EasingFn = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Bounce: peaks with dampening. */
export const bounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Elastic: overshoots before settling. */
export const elastic: EasingFn = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Lookup easing functions by name. */
export const easings: Record<string, EasingFn> = { linear, easeIn, easeOut, easeInOut, bounce, elastic };

/**
 * Interpolate between two values over time `t` (0..1) using an easing function.
 */
export function tween(from: number, to: number, t: number, ease: EasingFn = linear): number {
  return from + (to - from) * ease(t);
}
