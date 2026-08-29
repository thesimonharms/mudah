import { describe, expect, it } from 'vitest';
import {
  parseOscColor,
  parseThemeResponses,
  queryTerminalTheme,
  relativeLuminance,
  themeFromBackground,
  type ThemeQueryInput,
} from '@mudah-cli/terminal';

interface FakeTerminal {
  stdin: ThemeQueryInput;
  stdout: { write(data: string): unknown };
  /** Raw-mode transitions, in order. */
  rawModes: boolean[];
  /** Number of 'data' listeners registered. */
  listeners: number;
  /** Number of pause() calls. */
  pauses: number;
  /** Deliver a chunk to the registered listeners. */
  emit(chunk: string): void;
  /** Everything written to stdout. */
  written: string[];
}

/**
 * A stdin/stdout pair the query can drive. `reply` is delivered on the next
 * tick once the query is listening, imitating a real terminal.
 */
function fakeTerminal(
  options: { isTTY?: boolean; reply?: string | string[]; delayMs?: number } = {},
): FakeTerminal {
  const written: string[] = [];
  const rawModes: boolean[] = [];
  const handlers = new Set<(chunk: Buffer | string) => void>();
  const terminal = {
    written,
    rawModes,
    listeners: 0,
    pauses: 0,
    emit(chunk: string): void {
      for (const handler of [...handlers]) handler(chunk);
    },
    stdout: {
      write(data: string): unknown {
        written.push(data);
        return true;
      },
    },
    stdin: {
      isTTY: options.isTTY ?? true,
      isRaw: false,
      setRawMode(enabled: boolean): void {
        terminal.stdin.isRaw = enabled;
        rawModes.push(enabled);
      },
      resume(): void {},
      pause(): void {
        terminal.pauses += 1;
      },
      on(_event: string, listener: (chunk: Buffer | string) => void): void {
        handlers.add(listener);
        terminal.listeners += 1;
        const reply = options.reply;
        if (reply !== undefined) {
          const send = (): void => {
            const chunks = typeof reply === 'string' ? [reply] : reply;
            for (const chunk of chunks) terminal.emit(chunk);
          };
          setTimeout(send, options.delayMs ?? 0);
        }
      },
      off(_event: string, listener: (chunk: Buffer | string) => void): void {
        handlers.delete(listener);
        terminal.listeners = handlers.size;
      },
    },
  };

  return terminal;
}

describe('parseOscColor', () => {
  it('parses the X11 rgb: form with 4-digit channels', () => {
    expect(parseOscColor('rgb:1e1e/1e1e/1e1e')).toEqual({ r: 30, g: 30, b: 30 });
  });

  it('parses 2-digit channels without scaling', () => {
    expect(parseOscColor('rgb:ff/ff/ff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('scales short channels up to 8 bits', () => {
    expect(parseOscColor('rgb:f/f/f')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses a plain hex color', () => {
    expect(parseOscColor('#7aa2f7')).toEqual({ r: 122, g: 162, b: 247 });
  });

  it('returns null for junk', () => {
    expect(parseOscColor('nonsense')).toBeNull();
    expect(parseOscColor('')).toBeNull();
  });
});

describe('parseThemeResponses', () => {
  it('reads a background answer terminated by ST', () => {
    const parsed = parseThemeResponses('\x1b]11;rgb:0000/0000/0000\x1b\\');
    expect(parsed.background).toEqual({ r: 0, g: 0, b: 0 });
    expect(parsed.foreground).toBeUndefined();
  });

  it('reads answers terminated by BEL', () => {
    const parsed = parseThemeResponses('\x1b]10;rgb:ffff/ffff/ffff\x07');
    expect(parsed.foreground).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('reads both from one buffer', () => {
    const parsed = parseThemeResponses(
      '\x1b]10;rgb:ffff/ffff/ffff\x1b\\\x1b]11;rgb:0000/0000/0000\x1b\\',
    );
    expect(parsed.foreground).toEqual({ r: 255, g: 255, b: 255 });
    expect(parsed.background).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('ignores unrelated OSC codes', () => {
    expect(parseThemeResponses('\x1b]0;title\x07')).toEqual({});
  });
});

describe('luminance', () => {
  it('treats black as dark and white as light', () => {
    expect(themeFromBackground({ r: 0, g: 0, b: 0 })).toBe('dark');
    expect(themeFromBackground({ r: 255, g: 255, b: 255 })).toBe('light');
  });

  it('orders luminance as expected', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0);
  });

  it('classifies a mid-gray against the threshold', () => {
    const gray = { r: 128, g: 128, b: 128 };
    expect(themeFromBackground(gray, 0.2)).toBe('light');
    expect(themeFromBackground(gray, 0.8)).toBe('dark');
  });
});

describe('queryTerminalTheme', () => {
  it('refuses to query a non-TTY without writing anything', async () => {
    const fixture = fakeTerminal({ isTTY: false, reply: '\x1b]11;rgb:ffff/ffff/ffff\x1b\\' });
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 50,
    });
    expect(result).toEqual({ ok: false, theme: 'unknown', reason: 'not-a-tty' });
    expect(fixture.written).toEqual([]);
  });

  it('asks for both colors and reads the answer', async () => {
    const fixture = fakeTerminal({
      reply: '\x1b]10;rgb:ffff/ffff/ffff\x1b\\\x1b]11;rgb:0000/0000/0000\x1b\\',
    });
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 200,
    });

    expect(result.ok).toBe(true);
    expect(result.theme).toBe('dark');
    expect(result.background).toEqual({ r: 0, g: 0, b: 0 });
    expect(result.foreground).toEqual({ r: 255, g: 255, b: 255 });
    expect(fixture.written).toEqual(['\x1b]10;?\x1b\\', '\x1b]11;?\x1b\\']);
  });

  it('detects a light terminal', async () => {
    const fixture = fakeTerminal({ reply: '\x1b]11;rgb:ffff/ffff/ffff\x1b\\' });
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 200,
      includeForeground: false,
    });
    expect(result.ok).toBe(true);
    expect(result.theme).toBe('light');
  });

  it('times out cleanly when the terminal never answers', async () => {
    const fixture = fakeTerminal();
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 20,
    });
    expect(result).toEqual({ ok: false, theme: 'unknown', reason: 'timeout' });
  });

  it('restores raw mode, flow, and listeners after answering', async () => {
    const fixture = fakeTerminal({ reply: '\x1b]11;rgb:0000/0000/0000\x1b\\' });
    await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 200,
      includeForeground: false,
    });
    expect(fixture.listeners).toBe(0);
    expect(fixture.rawModes).toEqual([true, false]);
    expect(fixture.pauses).toBe(1);
  });

  it('restores state after a timeout too', async () => {
    const fixture = fakeTerminal();
    await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 15,
    });
    expect(fixture.listeners).toBe(0);
    expect(fixture.rawModes).toEqual([true, false]);
  });

  it('infers a dark terminal from a bright foreground', async () => {
    const fixture = fakeTerminal({ reply: '\x1b]10;rgb:ffff/ffff/ffff\x1b\\' });
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 200,
    });
    expect(result.foreground).toEqual({ r: 255, g: 255, b: 255 });
    expect(result.theme).toBe('dark');
  });

  it('handles a reply split across chunks', async () => {
    const fixture = fakeTerminal({ reply: ['\x1b]11;rgb:00', '00/0000/0000\x1b\\'], delayMs: 5 });
    const result = await queryTerminalTheme({
      stdout: fixture.stdout,
      stdin: fixture.stdin,
      timeoutMs: 300,
      includeForeground: false,
    });
    expect(result.ok).toBe(true);
    expect(result.background).toEqual({ r: 0, g: 0, b: 0 });
  });
});
