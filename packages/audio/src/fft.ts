export interface FftBandResult {
  readonly bass: number;
  readonly mid: number;
  readonly high: number;
  readonly energy: number;
  readonly bands: number[];
}

const BAND_COUNT = 8;

/**
 * FFT-derived bass / mid / high / energy plus 8 logarithmic bands.
 * Values are 0..1-ish magnitudes for typical -1..1 PCM.
 */
export class FftBands {
  static fromSamples(samples: Float32Array, sampleRate = 44100): FftBandResult {
    if (samples.length === 0) {
      return { bass: 0, mid: 0, high: 0, energy: 0, bands: zeros(BAND_COUNT) };
    }

    const energy = rms(samples);
    const spectrum = magnitudeSpectrum(samples);
    const nyquist = sampleRate / 2;
    const binHz = nyquist / Math.max(spectrum.length, 1);

    const bass = bandMean(spectrum, binHz, 20, 250);
    const mid = bandMean(spectrum, binHz, 250, 2000);
    const high = bandMean(spectrum, binHz, 2000, 12_000);
    const bands = logBands(spectrum, binHz, BAND_COUNT);

    return { bass, mid, high, energy, bands };
  }
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function magnitudeSpectrum(samples: Float32Array): Float64Array {
  const n = nextPow2(samples.length);
  const real = new Float64Array(n);
  const imag = new Float64Array(n);
  for (let i = 0; i < samples.length; i++) real[i] = samples[i] ?? 0;
  fft(real, imag);
  const half = n / 2;
  const mags = new Float64Array(half);
  const norm = 2 / n;
  for (let i = 0; i < half; i++) {
    const re = real[i] ?? 0;
    const im = imag[i] ?? 0;
    mags[i] = Math.sqrt(re * re + im * im) * norm;
  }
  return mags;
}

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const re = real[i] ?? 0;
      const im = imag[i] ?? 0;
      real[i] = real[j] ?? 0;
      imag[i] = imag[j] ?? 0;
      real[j] = re;
      imag[j] = im;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = real[i + j] ?? 0;
        const uIm = imag[i + j] ?? 0;
        const vr = real[i + j + half] ?? 0;
        const vi = imag[i + j + half] ?? 0;
        const vRe = vr * wRe - vi * wIm;
        const vIm = vr * wIm + vi * wRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + half] = uRe - vRe;
        imag[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function bandMean(spectrum: Float64Array, binHz: number, low: number, high: number): number {
  const start = Math.max(0, Math.floor(low / Math.max(binHz, 1e-9)));
  const end = Math.min(spectrum.length, Math.ceil(high / Math.max(binHz, 1e-9)));
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += spectrum[i] ?? 0;
  return sum / (end - start);
}

function logBands(spectrum: Float64Array, binHz: number, count: number): number[] {
  const maxHz = Math.max(binHz * spectrum.length, 1);
  const minHz = Math.max(binHz, 20);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const low = minHz * (maxHz / minHz) ** t0;
    const high = minHz * (maxHz / minHz) ** t1;
    out.push(bandMean(spectrum, binHz, low, high));
  }
  return out;
}
