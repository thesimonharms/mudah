/** One pitch or a rest. `beats` is in quarter notes. */
export interface Note {
  readonly midi: number | null;
  readonly beats: number;
}

export interface Tune {
  readonly id: string;
  readonly title: string;
  readonly source: string;
  readonly bpm: number;
  readonly notes: readonly Note[];
}

export function parsePitch(token: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(token);
  if (match === null) throw new Error(`[melody] Bad pitch ${token}.`);
  const letter = match[1] ?? 'C';
  const accidental = match[2] ?? '';
  const octave = Number(match[3]);
  const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] ?? 0;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (octave + 1) * 12 + semis + shift;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
  const n = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${names[n] ?? 'C'}${octave}`;
}

function n(token: string, beats: number): Note {
  return { midi: parsePitch(token), beats };
}

function rest(beats: number): Note {
  return { midi: null, beats };
}

const Q = 1;
const E = 0.5;
const H = 2;
const DQ = 1.5;

/** Beethoven, Symphony No. 9 (1824). The melody is in the public domain. */
const ODE_TO_JOY: Tune = {
  id: 'ode',
  title: 'Ode to Joy',
  source: 'Beethoven, 1824 · public domain',
  bpm: 108,
  notes: [
    n('E4', Q), n('E4', Q), n('F4', Q), n('G4', Q),
    n('G4', Q), n('F4', Q), n('E4', Q), n('D4', Q),
    n('C4', Q), n('C4', Q), n('D4', Q), n('E4', Q),
    n('E4', DQ), n('D4', E), n('D4', H),

    n('E4', Q), n('E4', Q), n('F4', Q), n('G4', Q),
    n('G4', Q), n('F4', Q), n('E4', Q), n('D4', Q),
    n('C4', Q), n('C4', Q), n('D4', Q), n('E4', Q),
    n('D4', DQ), n('C4', E), n('C4', H),

    n('D4', Q), n('D4', Q), n('E4', Q), n('C4', Q),
    n('D4', Q), n('E4', E), n('F4', E), n('E4', Q), n('C4', Q),
    n('D4', Q), n('E4', E), n('F4', E), n('E4', Q), n('D4', Q),
    n('C4', Q), n('D4', Q), n('G3', H),

    n('E4', Q), n('E4', Q), n('F4', Q), n('G4', Q),
    n('G4', Q), n('F4', Q), n('E4', Q), n('D4', Q),
    n('C4', Q), n('C4', Q), n('D4', Q), n('E4', Q),
    n('D4', DQ), n('C4', E), n('C4', H),
    rest(H),
  ],
};

/** French folk song (18th c.), also Mozart's Ah! vous dirai-je, maman. Public domain. */
const TWINKLE: Tune = {
  id: 'twinkle',
  title: 'Twinkle Twinkle Little Star',
  source: 'French folk · public domain',
  bpm: 100,
  notes: [
    n('C4', Q), n('C4', Q), n('G4', Q), n('G4', Q), n('A4', Q), n('A4', Q), n('G4', H),
    n('F4', Q), n('F4', Q), n('E4', Q), n('E4', Q), n('D4', Q), n('D4', Q), n('C4', H),
    n('G4', Q), n('G4', Q), n('F4', Q), n('F4', Q), n('E4', Q), n('E4', Q), n('D4', H),
    n('G4', Q), n('G4', Q), n('F4', Q), n('F4', Q), n('E4', Q), n('E4', Q), n('D4', H),
    n('C4', Q), n('C4', Q), n('G4', Q), n('G4', Q), n('A4', Q), n('A4', Q), n('G4', H),
    n('F4', Q), n('F4', Q), n('E4', Q), n('E4', Q), n('D4', Q), n('D4', Q), n('C4', H),
    rest(H),
  ],
};

/** Russian folk song (19th c.). Public domain. Not a video-game arrangement. */
const KOROBEINIKI: Tune = {
  id: 'korobeiniki',
  title: 'Korobeiniki',
  source: 'Russian folk · public domain',
  bpm: 144,
  notes: [
    n('E5', Q), n('B4', E), n('C5', E), n('D5', Q), n('C5', E), n('B4', E),
    n('A4', Q), n('A4', E), n('C5', E), n('E5', Q), n('D5', E), n('C5', E),
    n('B4', DQ), n('C5', E), n('D5', Q), n('E5', Q),
    n('C5', Q), n('A4', Q), n('A4', H),

    n('D5', DQ), n('F5', E), n('A5', Q), n('G5', E), n('F5', E),
    n('E5', DQ), n('C5', E), n('E5', Q), n('D5', E), n('C5', E),
    n('B4', DQ), n('C5', E), n('D5', Q), n('E5', Q),
    n('C5', Q), n('A4', Q), n('A4', H),
    rest(H),
  ],
};

export const TUNES: readonly Tune[] = [ODE_TO_JOY, TWINKLE, KOROBEINIKI];

export function tuneAt(index: number): Tune {
  const tune = TUNES[((index % TUNES.length) + TUNES.length) % TUNES.length];
  if (tune === undefined) throw new Error('[melody] No tunes.');
  return tune;
}
