export interface ParticleComputeOptions {
  /** Number of particles (vec2 positions). */
  count: number;
  /** Timestep in seconds. */
  dt: number;
  /** Interleaved x,y. Length `count * 2`. Allocated when omitted. */
  positions?: Float32Array;
  /** Interleaved vx,vy. Length `count * 2`. Allocated when omitted. */
  velocities?: Float32Array;
  /** Downward acceleration applied to vy. Default 0. */
  gravity?: number;
}

export interface ParticleComputeResult {
  positions: Float32Array;
  velocities: Float32Array;
}

/**
 * Software compute pass for particle physics (semi-implicit Euler).
 * `ShaderSession` has no GPU compute path, so this runs on the CPU.
 */
export function runParticleCompute(options: ParticleComputeOptions): ParticleComputeResult {
  const count = Math.max(0, Math.floor(options.count));
  const dt = options.dt;
  const gravity = options.gravity ?? 0;
  const positions = ensureVec2(options.positions, count, (i) => seedPosition(i, count));
  const velocities = ensureVec2(options.velocities, count, () => [0, 0]);

  for (let i = 0; i < count; i++) {
    const ix = i * 2;
    const iy = ix + 1;
    const vy = (velocities[iy] ?? 0) + gravity * dt;
    velocities[iy] = vy;
    positions[ix] = (positions[ix] ?? 0) + (velocities[ix] ?? 0) * dt;
    positions[iy] = (positions[iy] ?? 0) + vy * dt;
  }

  return { positions, velocities };
}

function ensureVec2(
  input: Float32Array | undefined,
  count: number,
  fill: (index: number) => readonly [number, number],
): Float32Array {
  const needed = count * 2;
  if (input !== undefined && input.length >= needed) return input;
  const out = new Float32Array(needed);
  if (input !== undefined) out.set(input.subarray(0, Math.min(input.length, needed)));
  for (let i = 0; i < count; i++) {
    if (input !== undefined && i * 2 + 1 < input.length) continue;
    const [x, y] = fill(i);
    out[i * 2] = x;
    out[i * 2 + 1] = y;
  }
  return out;
}

function seedPosition(index: number, count: number): readonly [number, number] {
  if (count <= 0) return [0, 0];
  const angle = (index / count) * Math.PI * 2;
  return [0.5 + 0.25 * Math.cos(angle), 0.5 + 0.25 * Math.sin(angle)];
}
