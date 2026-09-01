export interface MixChannelsOptions {
  /**
   * Per-buffer duck amount 0..1. Buffer `i` is attenuated by the peak of
   * the other buffers when `duck[i]` is set.
   */
  duck?: number[];
}

/**
 * Sum interleaved buffers (zero-padded to the longest). Optional per-buffer
 * ducking against the rest of the mix.
 */
export function mixChannels(buffers: Float32Array[], options: MixChannelsOptions = {}): Float32Array {
  const length = buffers.reduce((max, buf) => Math.max(max, buf.length), 0);
  const out = new Float32Array(length);
  const duck = options.duck ?? [];

  for (let b = 0; b < buffers.length; b++) {
    const buf = buffers[b];
    if (buf === undefined) continue;
    const amount = duck[b];
    const source = amount !== undefined && amount !== 0 ? duck(buf, othersPeak(buffers, b, length), amount) : buf;
    for (let i = 0; i < source.length; i++) {
      out[i] = (out[i] ?? 0) + (source[i] ?? 0);
    }
  }
  return out;
}

/**
 * Attenuate `target` when `sidechain` is loud. `amount` 0 leaves the target
 * unchanged; 1 silences it at full sidechain peak.
 */
export function duck(target: Float32Array, sidechain: Float32Array, amount: number): Float32Array {
  const peak = peakAbs(sidechain);
  const gain = Math.max(0, 1 - Math.min(1, amount) * Math.min(1, peak));
  const out = new Float32Array(target.length);
  for (let i = 0; i < target.length; i++) out[i] = (target[i] ?? 0) * gain;
  return out;
}

function peakAbs(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i] ?? 0);
    if (a > peak) peak = a;
  }
  return peak;
}

function othersPeak(buffers: Float32Array[], skip: number, length: number): Float32Array {
  const side = new Float32Array(length);
  for (let b = 0; b < buffers.length; b++) {
    if (b === skip) continue;
    const buf = buffers[b];
    if (buf === undefined) continue;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i] ?? 0);
      if (a > (side[i] ?? 0)) side[i] = a;
    }
  }
  return side;
}
