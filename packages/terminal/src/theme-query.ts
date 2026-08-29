import type { OscWriter } from './osc.js';

/** An 8-bit-per-channel sRGB color. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type TerminalTheme = 'dark' | 'light';

export type ThemeQueryFailure = 'not-a-tty' | 'timeout' | 'unsupported';

export interface ThemeQueryResult {
  /** True when at least one color came back from the terminal. */
  readonly ok: boolean;
  /** Reported background (OSC 11), when the terminal answered. */
  readonly background?: Rgb;
  /** Reported foreground (OSC 10), when the terminal answered. */
  readonly foreground?: Rgb;
  /** Theme inferred from the reported colors. */
  readonly theme: TerminalTheme | 'unknown';
  /** Why nothing came back, when `ok` is false. */
  readonly reason?: ThemeQueryFailure;
}

/** The subset of a readable stream the query needs. `process.stdin` fits. */
export interface ThemeQueryInput {
  readonly isTTY?: boolean;
  readonly isRaw?: boolean;
  setRawMode?(enabled: boolean): unknown;
  resume?(): unknown;
  pause?(): unknown;
  on(event: string, listener: (chunk: Buffer | string) => void): unknown;
  off(event: string, listener: (chunk: Buffer | string) => void): unknown;
}

export interface ThemeQueryOptions {
  /** Stream the query is written to (default `process.stdout`). */
  stdout?: OscWriter;
  /** Stream the answer is read from (default `process.stdin`). */
  stdin?: ThemeQueryInput;
  /** How long to wait for an answer before giving up. */
  timeoutMs?: number;
  /** Also ask for the foreground color (OSC 10). Default true. */
  includeForeground?: boolean;
}

const DEFAULT_TIMEOUT_MS = 150;

// Terminals answer with either `\x1b]11;rgb:…\x1b\\` (ST) or `\x1b]11;rgb:…\x07` (BEL).
const RESPONSE = /\x1b\](10|11);([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const RGB_FORM = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i;
const HEX_FORM = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Parse a single OSC color payload. Accepts the X11 `rgb:rr/gg/bb` form
 * (1–4 hex digits per channel, scaled to 8 bits) and plain `#rrggbb`.
 * Returns null for anything else.
 */
export function parseOscColor(value: string): Rgb | null {
  const text = value.trim();

  const rgb = RGB_FORM.exec(text);
  if (rgb) {
    return {
      r: scaleChannel(rgb[1] as string),
      g: scaleChannel(rgb[2] as string),
      b: scaleChannel(rgb[3] as string),
    };
  }

  const hex = HEX_FORM.exec(text);
  if (hex) {
    return {
      r: parseInt(hex[1] as string, 16),
      g: parseInt(hex[2] as string, 16),
      b: parseInt(hex[3] as string, 16),
    };
  }

  return null;
}

/** Scale a 1–4 digit hex channel up to the 0–255 range. */
function scaleChannel(hex: string): number {
  const max = 2 ** (hex.length * 4) - 1;
  return Math.round((parseInt(hex, 16) / max) * 255);
}

/**
 * Pull every OSC 10/11 answer out of a raw input buffer. Input that arrives
 * mid-response is kept by the caller, so this is safe to re-run per chunk.
 */
export function parseThemeResponses(
  buffer: string,
): { background?: Rgb; foreground?: Rgb } {
  const found: { background?: Rgb; foreground?: Rgb } = {};

  for (const match of buffer.matchAll(RESPONSE)) {
    const code = match[1];
    const color = parseOscColor(match[2] ?? '');
    if (color === null) continue;
    if (code === '11') found.background = color;
    if (code === '10') found.foreground = color;
  }

  return found;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
  );
}

/**
 * Classify a background as light or dark. `threshold` is the relative
 * luminance that separates the two (default 0.5).
 */
export function themeFromBackground(background: Rgb, threshold = 0.5): TerminalTheme {
  return relativeLuminance(background) >= threshold ? 'light' : 'dark';
}

/**
 * Ask the terminal for its colors with OSC 10 (foreground) and OSC 11
 * (background), then infer light/dark from the answer.
 *
 * Resolves fast on the paths that can't work: no TTY, or a terminal that
 * never answers (timeout). Terminal state (raw mode, flow, listeners) is
 * always restored before this returns.
 */
export async function queryTerminalTheme(
  options: ThemeQueryOptions = {},
): Promise<ThemeQueryResult> {
  const stdout = options.stdout ?? (process.stdout as unknown as OscWriter);
  const stdin = options.stdin ?? (process.stdin as unknown as ThemeQueryInput);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const includeForeground = options.includeForeground ?? true;

  if (stdin.isTTY !== true) {
    return { ok: false, theme: 'unknown', reason: 'not-a-tty' };
  }

  let buffer = '';
  let found: { background?: Rgb; foreground?: Rgb } = {};

  const isSettled = (): boolean =>
    found.background !== undefined &&
    (!includeForeground || found.foreground !== undefined);

  let done: (result: ThemeQueryResult) => void;
  const finished = new Promise<ThemeQueryResult>((resolve) => {
    done = resolve;
  });

  const settle = (): void => {
    clearTimeout(timer);
    stdin.off?.('data', listener);
    if (canRaw && stdin.isRaw !== wasRaw) stdin.setRawMode?.(wasRaw);
    if (didResume) stdin.pause?.();

    if (found.background === undefined && found.foreground === undefined) {
      done({ ok: false, theme: 'unknown', reason: 'timeout' });
      return;
    }

    done({
      ok: true,
      background: found.background,
      foreground: found.foreground,
      theme: inferTheme(found),
    });
  };

  const listener = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    found = parseThemeResponses(buffer);
    if (isSettled()) settle();
  };

  const canRaw = stdin.setRawMode !== undefined;
  const wasRaw = stdin.isRaw === true;
  const didResume = stdin.resume !== undefined;

  const timer = setTimeout(settle, timeoutMs);

  stdin.on('data', listener);
  if (canRaw && !wasRaw) stdin.setRawMode?.(true);
  stdin.resume?.();

  if (includeForeground) stdout.write('\x1b]10;?\x1b\\');
  stdout.write('\x1b]11;?\x1b\\');

  return finished;
}

/**
 * Background drives the guess. With only a foreground we invert it, which
 * is a weak signal — bright text usually sits on a dark terminal.
 */
function inferTheme(found: { background?: Rgb; foreground?: Rgb }): TerminalTheme | 'unknown' {
  if (found.background !== undefined) return themeFromBackground(found.background);
  if (found.foreground !== undefined) {
    return relativeLuminance(found.foreground) >= 0.5 ? 'dark' : 'light';
  }
  return 'unknown';
}
