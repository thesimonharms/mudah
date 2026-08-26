import { describe, expect, it } from 'vitest';
import { detectCapabilities, guardedOsc, KeyParser, osc, parseKeys } from '@mudah-cli/terminal';

describe('detectCapabilities', () => {
  it('detects Ghostty with truecolor and OSC 9 notifications', () => {
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM_PROGRAM: 'ghostty', TERM: 'xterm-ghostty', COLORTERM: 'truecolor' },
    });
    expect(caps.brand).toBe('ghostty');
    expect(caps.trueColor).toBe(true);
    expect(caps.osc9).toBe(true);
    expect(caps.osc133).toBe(false);
    expect(caps.animations).toBe(true);
  });

  it('detects Kitty with OSC 133 semantic prompts', () => {
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM: 'xterm-kitty', COLORTERM: 'truecolor' },
    });
    expect(caps.brand).toBe('kitty');
    expect(caps.osc133).toBe(true);
    expect(caps.osc9).toBe(false);
  });

  it('honors NO_COLOR', () => {
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM: 'xterm-256color', NO_COLOR: '1' },
    });
    expect(caps.color).toBe(false);
    expect(caps.colorLevel).toBe(0);
  });

  it('honors FORCE_COLOR levels', () => {
    const offTty = { isTty: false, env: {} as NodeJS.ProcessEnv };
    expect(detectCapabilities({ ...offTty, env: { FORCE_COLOR: '0' } }).colorLevel).toBe(0);
    expect(detectCapabilities({ ...offTty, env: { FORCE_COLOR: '2' } }).colorLevel).toBe(8);
    expect(detectCapabilities({ ...offTty, env: { FORCE_COLOR: '3' } }).colorLevel).toBe(24);
  });

  it('renders color on CI with COLORTERM', () => {
    const caps = detectCapabilities({
      isTty: false,
      env: { CI: 'true', COLORTERM: 'truecolor' },
    });
    expect(caps.colorLevel).toBe(24);
    expect(caps.animations).toBe(false);
  });

  it('falls back to 256 color on CI without COLORTERM', () => {
    const caps = detectCapabilities({ isTty: false, env: { CI: 'true' } });
    expect(caps.colorLevel).toBe(8);
  });

  it('disables unicode for TERM=dumb and supports reduced motion', () => {
    const caps = detectCapabilities({
      isTty: true,
      env: { TERM: 'dumb', MUDAH_REDUCED_MOTION: '1' },
    });
    expect(caps.unicode).toBe(false);
    expect(caps.reducedMotion).toBe(true);
    expect(caps.animations).toBe(false);
  });

  it('explicit overrides win over detection', () => {
    const caps = detectCapabilities({
      isTty: false,
      env: { NO_COLOR: '1' },
      overrides: { color: true, theme: 'dark' },
    });
    expect(caps.color).toBe(true);
    expect(caps.theme).toBe('dark');
  });
});

describe('parseKeys', () => {
  const names = (s: string) => parseKeys(s).map((k) => k.name);

  it('parses printable characters', () => {
    expect(names('abc')).toEqual(['a', 'b', 'c']);
    expect(names(' ')).toEqual(['space']);
  });

  it('parses arrow keys and navigation', () => {
    expect(names('\x1b[A')).toEqual(['up']);
    expect(names('\x1b[B')).toEqual(['down']);
    expect(names('\x1b[C')).toEqual(['right']);
    expect(names('\x1b[D')).toEqual(['left']);
    expect(names('\x1b[H')).toEqual(['home']);
    expect(names('\x1b[F')).toEqual(['end']);
    expect(names('\x1b[5~')).toEqual(['page-up']);
    expect(names('\x1b[6~')).toEqual(['page-down']);
    expect(names('\x1b[3~')).toEqual(['delete']);
  });

  it('parses modified navigation (ctrl+right)', () => {
    expect(names('\x1b[1;5C')).toEqual(['right']);
  });

  it('parses enter, backspace, tab, and escape', () => {
    expect(names('\r')).toEqual(['enter']);
    expect(names('\n')).toEqual(['enter']);
    expect(names('\x7f')).toEqual(['backspace']);
    expect(names('\t')).toEqual(['tab']);
    expect(names('\x1b[Z')).toEqual(['shift-tab']);
    expect(names('\x1b')).toEqual(['escape']);
  });

  it('parses control characters', () => {
    expect(names('\x03')).toEqual(['ctrl+c']);
    expect(names('\x04')).toEqual(['ctrl+d']);
    expect(names('\x01')).toEqual(['ctrl+a']);
  });

  it('parses mixed input', () => {
    expect(names('a\x1b[Bb')).toEqual(['a', 'down', 'b']);
  });
});

describe('KeyParser', () => {
  it('buffers incomplete escape sequences across chunks', () => {
    const parser = new KeyParser();
    expect(parser.feed('a')).toEqual([{ name: 'a', ch: 'a' }]);
    expect(parser.feed('\x1b[')).toEqual([]);
    expect(parser.feed('1;5C')).toEqual([{ name: 'right' }]);
  });

  it('resolves a bare escape once the next input is known', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b')).toEqual([]);
    expect(parser.feed('x').map((k) => k.name)).toEqual(['escape']);
    expect(parser.feed('').map((k) => k.name)).toEqual(['x']);
  });

  it('handles sequences split across arbitrary boundaries', () => {
    const parser = new KeyParser();
    const full = '\x1b[3~';
    const seen: string[] = [];
    for (const chunk of [full.slice(0, 1), full.slice(1, 3), full.slice(3)]) {
      seen.push(...parser.feed(chunk).map((k) => k.name));
    }
    expect(seen).toEqual(['delete']);
  });
});

describe('osc', () => {
  function capture(): { stream: { write(data: string): void }; buffer: { value: string } } {
    const buffer = { value: '' };
    return {
      stream: {
        write(data: string): void {
          buffer.value += data;
        },
      },
      buffer,
    };
  }

  it('emits a window title', () => {
    const { stream, buffer } = capture();
    osc.title(stream, 'hello');
    expect(buffer.value).toBe('\x1b]0;hello\x07');
  });

  it('emits OSC 9 notifications with the unit separator', () => {
    const { stream, buffer } = capture();
    osc.notify(stream, 'Title', 'Done');
    expect(buffer.value).toContain('\x1b]9;Title\x1fDone\x07');
    expect(buffer.value).toContain('777;notify;Title;Done');
  });

  it('emits semantic prompt markers', () => {
    const { stream, buffer } = capture();
    osc.promptStart(stream);
    osc.promptEnd(stream);
    osc.commandEnd(stream, 0);
    expect(buffer.value).toBe('\x1b]133;A\x07\x1b]133;B\x07\x1b]133;D;0\x07');
  });

  it('guardedOsc no-ops for missing capabilities', () => {
    const { stream, buffer } = capture();
    const guarded = guardedOsc(stream, { osc9: false, osc133: false });
    guarded.notify('T', 'M');
    guarded.promptStart();
    guarded.commandEnd(1);
    expect(buffer.value).toBe('');
  });
});
