import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fillSine, makeBlip, runPlayground } from '../src/playground.js';
import { fileURLToPath } from 'node:url';

describe('tone generators', () => {
  it('fills a stereo sine without leaving the s16 range', () => {
    const pcm = new Int16Array(256);
    const next = fillSine(pcm, 0, 0.5, 44100, 2);
    expect(next).toBe(128);
    expect(pcm.some((s) => s !== 0)).toBe(true);
    expect(Math.max(...pcm)).toBeLessThanOrEqual(32767);
    expect(Math.min(...pcm)).toBeGreaterThanOrEqual(-32768);
  });

  it('builds a decaying blip', () => {
    const blip = makeBlip(44100, 2);
    expect(blip.length).toBeGreaterThan(1000);
    const peak = Math.max(...blip.map((s) => Math.abs(s)));
    expect(peak).toBeGreaterThan(1000);
    expect(Math.abs(blip[blip.length - 1] ?? 0)).toBeLessThan(peak / 2);
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

  it('loads under node without compiling playground.ts to .js', () => {
    const bin = fileURLToPath(new URL('../bin/tone.js', import.meta.url));
    const cwd = fileURLToPath(new URL('..', import.meta.url));
    const out = execFileSync(process.execPath, [bin, '--help'], { cwd, encoding: 'utf8' });
    expect(out).toContain('play');
  });
});
