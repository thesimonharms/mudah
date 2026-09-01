import { describe, expect, it } from 'vitest';
import { FftBands, createMicrophone } from '@mudah-cli/audio';

function sine(freq: number, n: number, sampleRate = 44100): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe('FftBands', () => {
  it('extracts bass / mid / high / energy from samples', () => {
    const empty = FftBands.fromSamples(new Float32Array(0));
    expect(empty.energy).toBe(0);
    expect(empty.bands).toHaveLength(8);

    const bassTone = FftBands.fromSamples(sine(80, 2048));
    const highTone = FftBands.fromSamples(sine(4000, 2048));
    expect(bassTone.energy).toBeGreaterThan(0.4);
    expect(bassTone.bass).toBeGreaterThan(highTone.bass);
    expect(highTone.high).toBeGreaterThan(bassTone.high);
    expect(bassTone.bands.length).toBe(8);
  });
});

describe('createMicrophone', () => {
  it('uses an injectable reader and defaults to silence', () => {
    const silent = createMicrophone();
    expect(silent.read().length).toBe(0);
    silent.close();
    expect(silent.read().length).toBe(0);

    const samples = Float32Array.of(0.1, -0.2);
    const mic = createMicrophone({ read: () => samples, sampleRate: 48000 });
    expect(mic.sampleRate).toBe(48000);
    expect(mic.read()).toBe(samples);
  });
});
