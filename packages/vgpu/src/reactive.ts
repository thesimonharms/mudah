export interface AudioReactiveSource {
  bands(): number[];
  energy(): number;
}

export interface ShaderUniformTarget {
  setUniforms?(values: Record<string, unknown>): unknown;
  set?(values: Record<string, unknown>): unknown;
}

export interface BindAudioReactiveOptions {
  /** Write uniforms flat, nested under `params`, or both. Default `both`. */
  binding?: 'flat' | 'params' | 'both';
}

export interface AudioReactiveBinding {
  /** Read the source and write uniforms now. */
  sync(): Record<string, number>;
  dispose(): void;
}

/**
 * Drive shader uniforms `energy`, `bass`, `mid`, `high` from an audio
 * source (typically `@mudah-cli/audio` `createReactiveBridge()`).
 */
export function bindAudioReactive(
  session: ShaderUniformTarget,
  source: AudioReactiveSource,
  options: BindAudioReactiveOptions = {},
): AudioReactiveBinding {
  const binding = options.binding ?? 'both';
  let disposed = false;

  const sync = (): Record<string, number> => {
    const energy = source.energy();
    const bands = source.bands();
    const bass = pickBand(bands, 0, 0, 0.25);
    const mid = pickBand(bands, 1, 0.25, 0.7);
    const high = pickBand(bands, 2, 0.7, 1);
    const values = { energy, bass, mid, high };
    if (!disposed) writeUniforms(session, values, binding);
    return values;
  };

  return {
    sync,
    dispose(): void {
      disposed = true;
    },
  };
}

function pickBand(bands: number[], index: number, startFrac: number, endFrac: number): number {
  if (bands.length === 0) return 0;
  if (bands.length === 3) return bands[index] ?? 0;
  const start = Math.floor(startFrac * bands.length);
  const end = Math.max(start + 1, Math.ceil(endFrac * bands.length));
  let sum = 0;
  let n = 0;
  for (let i = start; i < end && i < bands.length; i++) {
    sum += bands[i] ?? 0;
    n += 1;
  }
  return n === 0 ? 0 : sum / n;
}

function writeUniforms(
  session: ShaderUniformTarget,
  values: Record<string, number>,
  binding: 'flat' | 'params' | 'both',
): void {
  const payload: Record<string, unknown> =
    binding === 'flat'
      ? values
      : binding === 'params'
        ? { params: values }
        : { ...values, params: values };
  if (session.setUniforms !== undefined) {
    session.setUniforms(payload);
    return;
  }
  session.set?.(payload);
}
