export type BeatSubdivision = 4 | 8 | 16;

/**
 * Snap `timeSec` to the nearest beat-grid position.
 * `subdivision` 4 = quarter, 8 = eighth, 16 = sixteenth.
 */
export function quantize(timeSec: number, bpm: number, subdivision: BeatSubdivision = 4): number {
  const beatSec = 60 / Math.max(bpm, 1e-6);
  const step = beatSec * (4 / subdivision);
  return Math.round(timeSec / step) * step;
}
