import { FftBands, type FftBandResult } from './fft.js';

export type ReactiveEvent = 'beat' | 'energy';

export type ReactiveListener = (value: number) => void;

export interface ReactiveBridge {
  push(samples: Float32Array): FftBandResult;
  bands(): number[];
  energy(): number;
  on(event: ReactiveEvent, fn: ReactiveListener): () => void;
}

export interface ReactiveBridgeOptions {
  sampleRate?: number;
  /** Energy rise ratio that counts as a beat. Default 1.4. */
  beatRatio?: number;
  /** Minimum energy to emit a beat. Default 0.08. */
  beatFloor?: number;
}

/**
 * Audio-reactive event bridge for `@mudah-cli/vgpu` `bindAudioReactive`.
 * `push` runs FFT band extraction and emits `'energy'` / `'beat'`.
 */
export function createReactiveBridge(options: ReactiveBridgeOptions = {}): ReactiveBridge {
  const sampleRate = options.sampleRate ?? 44100;
  const beatRatio = options.beatRatio ?? 1.4;
  const beatFloor = options.beatFloor ?? 0.08;
  let last: FftBandResult = { bass: 0, mid: 0, high: 0, energy: 0, bands: [] };
  let prevEnergy = 0;
  let cooldown = 0;
  const listeners: Record<ReactiveEvent, Set<ReactiveListener>> = {
    beat: new Set(),
    energy: new Set(),
  };

  return {
    push(samples: Float32Array): FftBandResult {
      last = FftBands.fromSamples(samples, sampleRate);
      for (const fn of listeners.energy) fn(last.energy);
      const rising = last.energy > prevEnergy * beatRatio && last.energy >= beatFloor;
      if (rising && cooldown <= 0) {
        for (const fn of listeners.beat) fn(last.energy);
        cooldown = 3;
      } else {
        cooldown = Math.max(0, cooldown - 1);
      }
      prevEnergy = last.energy;
      return last;
    },
    bands(): number[] {
      if (last.bands.length > 0) return last.bands;
      return [last.bass, last.mid, last.high];
    },
    energy(): number {
      return last.energy;
    },
    on(event: ReactiveEvent, fn: ReactiveListener): () => void {
      listeners[event].add(fn);
      return () => {
        listeners[event].delete(fn);
      };
    },
  };
}
