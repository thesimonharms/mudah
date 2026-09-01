export type TuneDurationUnit = 'sec' | 'beat';

/** One pitch or a rest. `duration` is seconds when `unit` is `sec`, beats (quarter = 1) otherwise. */
export interface Note {
  readonly name: string;
  readonly midi: number | null;
  readonly duration: number;
  readonly unit: TuneDurationUnit;
}

export interface Tune {
  readonly notes: readonly Note[];
  readonly source: string;
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const NOTE_VALUES: Record<string, number> = {
  '1n': 4,
  '2n': 2,
  '4n': 1,
  '8n': 0.5,
  '16n': 0.25,
  '32n': 0.125,
};

/**
 * Parse a tone-sequence DSL.
 *
 * - `C4:0.25 D4:0.25 rest:0.5` — duration in seconds
 * - `C4 8n, D4 8n` — note values (`4n` quarter, `8n` eighth, dotted `8n.`)
 */
export function parseTune(text: string): Tune {
  const notes: Note[] = [];
  const tokens = tokenize(text);
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? '';
    const colon = token.indexOf(':');
    if (colon > 0) {
      notes.push(makeNote(token.slice(0, colon), token.slice(colon + 1)));
      i += 1;
      continue;
    }
    const next = tokens[i + 1];
    if (next !== undefined && isDurationToken(next)) {
      notes.push(makeNote(token, next));
      i += 2;
      continue;
    }
    throw new Error(`[audio] Tune token "${token}" needs a duration (C4:0.25 or C4 8n).`);
  }
  return { notes, source: text };
}

export function parsePitch(token: string): number {
  const match = /^([A-G])([#b]?)(-?\d+)$/.exec(token);
  if (match === null) throw new Error(`[audio] Bad pitch ${token}.`);
  const letter = match[1] ?? 'C';
  const accidental = match[2] ?? '';
  const octave = Number(match[3]);
  const semis = LETTERS[letter] ?? 0;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (octave + 1) * 12 + semis + shift;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function tokenize(text: string): string[] {
  const stripped = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .join(' ');
  return stripped.split(/[\s,]+/).filter(Boolean);
}

function isRest(token: string): boolean {
  const lower = token.toLowerCase();
  return lower === 'rest' || lower === 'r' || token === '-';
}

function isDurationToken(token: string): boolean {
  return parseDuration(token) !== undefined;
}

function parseDuration(token: string): { duration: number; unit: TuneDurationUnit } | undefined {
  if (/^\d+(?:\.\d+)?$/.test(token)) return { duration: Number(token), unit: 'sec' };
  const dotted = token.endsWith('.');
  const core = dotted ? token.slice(0, -1) : token;
  const beats = NOTE_VALUES[core];
  if (beats === undefined) return undefined;
  return { duration: dotted ? beats * 1.5 : beats, unit: 'beat' };
}

function makeNote(pitchToken: string, durationToken: string): Note {
  const parsed = parseDuration(durationToken);
  if (parsed === undefined) {
    throw new Error(`[audio] Bad duration "${durationToken}". Use seconds or 4n/8n/16n.`);
  }
  if (isRest(pitchToken)) {
    return { name: 'rest', midi: null, duration: parsed.duration, unit: parsed.unit };
  }
  const midi = parsePitch(pitchToken);
  return { name: pitchToken, midi, duration: parsed.duration, unit: parsed.unit };
}
