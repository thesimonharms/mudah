/**
 * Color assertions for TUI snapshots.
 *
 * These are plain functions, not vitest matchers, so they don't force a
 * vitest dependency on the testing package. The user's tests can wrap them
 * in `expect(() => assertHasColor(...)).not.toThrow()` or similar.
 */
import { stripAnsi } from '@mudah-cli/ui';

export interface ColorExpectation {
  /** Plain-text fragment to find. */
  text: string;
  /** Hex color (case-insensitive) expected on at least one matched cell. */
  hex: string;
}

const ANSI_SGR_FOREGROUND = /\x1b\[(?:38;2;(\d+);(\d+);(\d+)|38;5;(\d+)|3[0-8])m/g;

function hexFromRgb(r: string, g: string, b: string): string {
  return '#' + [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

/** Return runs of (text, optional hex color) covering `text` in order. */
function styledRuns(text: string): Array<{ text: string; hex?: string }> {
  const runs: Array<{ text: string; hex?: string }> = [];
  let last = 0;
  let current: { text: string; hex?: string } = { text: '' };
  for (const match of text.matchAll(ANSI_SGR_FOREGROUND)) {
    // Close out whatever came before this escape.
    const start = match.index ?? 0;
    current.text += text.slice(last, start);
    if (current.text.length > 0) runs.push(current);
    // Open a new run carrying the color from this escape.
    const r = match[1];
    const g = match[2];
    const b = match[3];
    current = r && g && b ? { text: '', hex: hexFromRgb(r, g, b) } : { text: '' };
    last = start + match[0].length;
  }
  current.text += text.slice(last);
  if (current.text.length > 0) runs.push(current);
  return runs;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = parseInt(full, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Assert that `text` contains a fragment painted with the given hex color.
 * Throws on failure with a diff-style message.
 */
export function assertHasColor(text: string, expectation: ColorExpectation): void {
  const { text: fragment, hex } = expectation;
  const plain = stripAnsi(text);
  const at = plain.indexOf(fragment);
  if (at < 0) {
    throw new Error(`[testing] Snapshot does not contain "${fragment}".\n--- snapshot ---\n${text}`);
  }

  // Walk the styled runs and find a run whose text overlaps [at, at+fragment.length].
  const end = at + fragment.length;
  let cursor = 0;
  let found: string | undefined;
  for (const run of styledRuns(text)) {
    const runStart = cursor;
    const runEnd = cursor + stripAnsi(run.text).length;
    if (run.hex !== undefined && runStart < end && runEnd > at) {
      found = run.hex;
      break;
    }
    cursor = runEnd;
  }

  if (found === undefined) {
    throw new Error(
      `[testing] "${fragment}" appears in the snapshot but is not painted with a hex color (the cell uses the default style).\n--- snapshot ---\n${text}`,
    );
  }

  const [r1, g1, b1] = hexToRgb(found);
  const [r2, g2, b2] = hexToRgb(hex);
  if (r1 !== r2 || g1 !== g2 || b1 !== b2) {
    throw new Error(
      `[testing] "${fragment}" is painted with ${found} but expected ${hex}.\n--- snapshot ---\n${text}`,
    );
  }
}

/**
 * Assert that `text` does NOT contain a fragment painted with the given hex
 * color (i.e. the fragment is present but in a different color, or absent
 * entirely).
 */
export function assertLacksColor(text: string, expectation: ColorExpectation): void {
  const { text: fragment } = expectation;
  if (!stripAnsi(text).includes(fragment)) return;
  try {
    assertHasColor(text, expectation);
  } catch {
    return;
  }
  throw new Error(`[testing] "${fragment}" appears painted with ${expectation.hex} when it should not.`);
}
