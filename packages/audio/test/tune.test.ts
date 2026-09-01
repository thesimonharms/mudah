import { describe, expect, it } from 'vitest';
import { midiToHz, parsePitch, parseTune } from '@mudah-cli/audio';

describe('parseTune', () => {
  it('parses pitch:seconds and rests', () => {
    const tune = parseTune('C4:0.25 D4:0.25 rest:0.5');
    expect(tune.notes).toEqual([
      { name: 'C4', midi: 60, duration: 0.25, unit: 'sec' },
      { name: 'D4', midi: 62, duration: 0.25, unit: 'sec' },
      { name: 'rest', midi: null, duration: 0.5, unit: 'sec' },
    ]);
  });

  it('parses note-value tokens', () => {
    const tune = parseTune('C4 8n, D4 8n');
    expect(tune.notes.map((n) => n.duration)).toEqual([0.5, 0.5]);
    expect(tune.notes.every((n) => n.unit === 'beat')).toBe(true);
    expect(tune.notes[0]?.midi).toBe(60);
  });

  it('maps A4 to 440 Hz', () => {
    expect(parsePitch('A4')).toBe(69);
    expect(midiToHz(69)).toBe(440);
  });
});
