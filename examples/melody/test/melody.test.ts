import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Sequencer } from '../src/synth.js';
import { midiToHz, parsePitch, pitchName, TUNES, tuneAt } from '../src/tunes.js';
import { runPlayground } from '../src/playground.js';

describe('pitches', () => {
  it('maps A4 to 440 Hz and MIDI 69', () => {
    expect(parsePitch('A4')).toBe(69);
    expect(midiToHz(69)).toBe(440);
    expect(pitchName(69)).toBe('A4');
    expect(parsePitch('C4')).toBe(60);
    expect(parsePitch('G#3')).toBe(56);
  });
});

describe('tunes', () => {
  it('ships three public-domain melodies', () => {
    expect(TUNES.map((t) => t.id)).toEqual(['ode', 'twinkle', 'korobeiniki']);
    for (const tune of TUNES) {
      expect(tune.source).toContain('public domain');
      expect(tune.notes.length).toBeGreaterThan(8);
      expect(tune.notes.some((n) => n.midi !== null)).toBe(true);
    }
    expect(tuneAt(0).id).toBe('ode');
    expect(tuneAt(-1).id).toBe('korobeiniki');
  });
});

describe('sequencer', () => {
  it('fills stereo PCM in the s16 range', () => {
    const seq = new Sequencer(tuneAt(0), 44100, 2);
    const pcm = new Int16Array(2048);
    const frame = seq.fill(pcm);
    expect(frame.title).toBe('Ode to Joy');
    expect(pcm.some((s) => s !== 0)).toBe(true);
    expect(Math.max(...pcm)).toBeLessThanOrEqual(32767);
    expect(Math.min(...pcm)).toBeGreaterThanOrEqual(-32768);
  });

  it('writes silence while paused', () => {
    const seq = new Sequencer(tuneAt(0), 44100, 2);
    seq.paused = true;
    const pcm = new Int16Array(512);
    seq.fill(pcm);
    expect(pcm.every((s) => s === 0)).toBe(true);
  });

  it('wraps after the last note', () => {
    const seq = new Sequencer(
      {
        id: 'loop',
        title: 'Loop',
        source: 'test · public domain',
        bpm: 600,
        notes: [{ midi: 69, beats: 0.05 }],
      },
      8000,
      1,
    );
    const pcm = new Int16Array(800);
    seq.fill(pcm);
    expect(seq.fill(new Int16Array(8)).noteIndex).toBeGreaterThanOrEqual(0);
    expect(pcm.some((s) => s !== 0)).toBe(true);
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

  it('loads under node without compiling to .js', () => {
    const bin = fileURLToPath(new URL('../bin/melody.js', import.meta.url));
    const cwd = fileURLToPath(new URL('..', import.meta.url));
    const out = execFileSync(process.execPath, [bin, '--help'], { cwd, encoding: 'utf8' });
    expect(out).toContain('play');
  });
});
