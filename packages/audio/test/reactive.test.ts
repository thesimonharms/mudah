import { describe, expect, it } from 'vitest';
import { bindAudioReactive } from '@mudah-cli/vgpu';
import { createReactiveBridge } from '@mudah-cli/audio';

function sine(freq: number, n: number, sampleRate = 44100): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe('createReactiveBridge', () => {
  it('exposes bands/energy for bindAudioReactive and emits beat/energy', () => {
    const bridge = createReactiveBridge();
    const energyEvents: number[] = [];
    const beats: number[] = [];
    bridge.on('energy', (v) => energyEvents.push(v));
    bridge.on('beat', (v) => beats.push(v));

    expect(bridge.energy()).toBe(0);
    expect(bridge.bands()).toEqual([0, 0, 0]);

    bridge.push(new Float32Array(64));
    bridge.push(sine(220, 1024));
    expect(bridge.energy()).toBeGreaterThan(0.3);
    expect(bridge.bands().length).toBeGreaterThanOrEqual(3);
    expect(energyEvents.length).toBe(2);
    expect(beats.length).toBeGreaterThanOrEqual(1);

    const written: Record<string, unknown>[] = [];
    const bind = bindAudioReactive(
      {
        setUniforms(values: Record<string, unknown>): void {
          written.push(values);
        },
      },
      bridge,
    );
    bind.sync();
    expect(written[0]).toMatchObject({ energy: bridge.energy() });
    expect(typeof (written[0] as { bass: number }).bass).toBe('number');
  });
});
