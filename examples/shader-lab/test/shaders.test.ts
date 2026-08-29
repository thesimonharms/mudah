import { describe, expect, it } from 'vitest';
import { SHADERS } from '../src/shaders.js';
import { runPlayground } from '../src/playground.js';

describe('shaders', () => {
  it('ships three named effects with a fragment entry', () => {
    expect(SHADERS.map((s) => s.id)).toEqual(['aurora', 'tunnel', 'phosphor']);
    for (const shader of SHADERS) {
      expect(shader.source).toContain('@fragment');
      expect(shader.source).toContain('params.energy');
    }
  });
});

describe('playground', () => {
  it('exits with 1 when stdout is not a TTY', async () => {
    let out = '';
    const code = await runPlayground(
      { write: (data) => void (out += data), isTTY: false },
      process.stdin,
    );
    expect(code).toBe(1);
    expect(out).toContain('TTY');
  });
});
