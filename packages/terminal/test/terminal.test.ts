import { describe, expect, it } from 'vitest';
import {
  detectCapabilities,
  guardedOsc,
  KeyParser,
  osc,
  parseKeys,
  normalizeKey,
  normalizeKeys,
  sniffPalette,
  pickColorFallback,
  enableKittyKeyboard,
  disableKittyKeyboard,
} from '@mudah-cli/terminal';

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
    expect(caps.kittyGraphics).toBe(true);
    expect(caps.kittyKeyboard).toBe(true);
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
    expect(caps.kittyGraphics).toBe(true);
    expect(caps.kittyKeyboard).toBe(true);
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

  it('emits a single paste event for a 200~ / 201~ chunk', () => {
    const events = parseKeys('\x1b[200~hello\r\nworld\x1b[201~');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: 'paste', paste: 'hello\r\nworld' });
  });

  it('keeps keys inside a paste payload as paste text, not events', () => {
    const events = parseKeys('\x1b[200~hi\x1b[A\x1b[201~');
    expect(events).toEqual([{ name: 'paste', paste: 'hi\x1b[A', kind: 'press' }]);
  });
});

describe('normalizeKey', () => {
  it('strips Kitty CSI-u modifiers into a shared shape', () => {
    const [event] = parseKeys('\x1b[97;3u');
    expect(event?.name).toBe('alt+a');
    expect(normalizeKey(event!)).toEqual({
      name: 'a',
      shift: false,
      alt: true,
      ctrl: false,
      meta: false,
      ch: 'a',
    });
  });

  it('parses legacy ESC+letter into the same shape as Kitty alt', () => {
    const kitty = normalizeKey(parseKeys('\x1b[97;3u')[0]!);
    const legacy = parseKeys('\x1ba', { normalize: true });
    expect(legacy).toHaveLength(1);
    expect(legacy[0]?.name).toBe('alt+a');
    expect(legacy[0]?.normalized).toEqual(kitty);

    const merged = normalizeKeys(parseKeys('\x1ba'));
    expect(merged).toEqual([kitty]);
  });

  it('normalizes ctrl+c and shift-tab', () => {
    expect(normalizeKey(parseKeys('\x03')[0]!)).toEqual({
      name: 'c',
      shift: false,
      alt: false,
      ctrl: true,
      meta: false,
    });
    expect(normalizeKey(parseKeys('\x1b[Z')[0]!)).toEqual({
      name: 'tab',
      shift: true,
      alt: false,
      ctrl: false,
      meta: false,
    });
  });

  it('does not change default parseKeys output for ESC+letter', () => {
    expect(parseKeys('\x1ba').map((k) => k.name)).toEqual(['escape', 'a']);
  });
});

describe('sniffPalette / pickColorFallback', () => {
  it('sniffs truecolor, 256, 16, and none', () => {
    expect(sniffPalette({ env: { COLORTERM: 'truecolor' }, isTty: true })).toBe(24);
    expect(sniffPalette({ colorterm: 'yes', env: {}, isTty: true })).toBe(24);
    expect(sniffPalette({ env: { TERM: 'xterm-256color' }, isTty: true })).toBe(8);
    expect(sniffPalette({ env: { TERM: 'xterm' }, isTty: true })).toBe(1);
    expect(sniffPalette({ env: { NO_COLOR: '1', TERM: 'xterm-256color' }, isTty: true })).toBe(0);
    expect(sniffPalette({ forceColor: '3', env: {}, isTty: false })).toBe(24);
  });

  it('picks the lower of desired and available', () => {
    expect(pickColorFallback(24, 8)).toBe(8);
    expect(pickColorFallback(8, 24)).toBe(8);
    expect(pickColorFallback(24, 24)).toBe(24);
    expect(pickColorFallback(1, 0)).toBe(0);
    expect(pickColorFallback(8, 1)).toBe(1);
  });
});

describe('KeyParser', () => {
  it('buffers incomplete escape sequences across chunks', () => {
    const parser = new KeyParser();
    expect(parser.feed('a')).toEqual([{ name: 'a', ch: 'a', kind: 'press' }]);
    expect(parser.feed('\x1b[')).toEqual([]);
    expect(parser.feed('1;5C')).toEqual([{ name: 'right', kind: 'press', shift: false, alt: false, ctrl: true }]);
  });

  it('emits escape immediately at a chunk boundary', () => {
    // Terminals deliver a full CSI sequence in one read, so a lone ESC at
    // a chunk boundary IS the escape key (no second keypress needed).
    const parser = new KeyParser();
    expect(parser.feed('\x1b').map((k) => k.name)).toEqual(['escape']);
    expect(parser.feed('x').map((k) => k.name)).toEqual(['x']);
  });

  it('reassembles sequences split after the introducer', () => {
    // A split after "ESC [" is held and reassembled; only a split directly
    // after ESC is treated as a bare escape (terminal reads are atomic).
    const parser = new KeyParser();
    const seen: string[] = [];
    for (const chunk of ['\x1b[', '3~']) {
      seen.push(...parser.feed(chunk).map((k) => k.name));
    }
    expect(seen).toEqual(['delete']);
  });
});

describe('Kitty keyboard protocol', () => {
  const kinds = (s: string) => parseKeys(s).map((k) => ({ name: k.name, kind: k.kind, ch: k.ch }));

  it('parses CSI u press and release for a letter', () => {
    expect(kinds('\x1b[97u')).toEqual([{ name: 'a', kind: 'press', ch: 'a' }]);
    expect(kinds('\x1b[97;1:3u')).toEqual([{ name: 'a', kind: 'release', ch: 'a' }]);
    expect(kinds('\x1b[97;1:2u')).toEqual([{ name: 'a', kind: 'repeat', ch: 'a' }]);
  });

  it('maps ctrl+c from CSI u so quit still works', () => {
    const [event] = parseKeys('\x1b[99;5u');
    expect(event?.name).toBe('ctrl+c');
    expect(event?.ctrl).toBe(true);
    expect(event?.kind).toBe('press');
  });

  it('parses an arrow release', () => {
    const [event] = parseKeys('\x1b[1;1:3A');
    expect(event?.name).toBe('up');
    expect(event?.kind).toBe('release');
  });

  it('skips a Kitty graphics APC so it never becomes a key', () => {
    expect(parseKeys('\x1b_Gi=1;OK\x1b\\a').map((k) => k.name)).toEqual(['a']);
  });

  it('emits enable and disable sequences', () => {
    expect(enableKittyKeyboard()).toBe('\x1b[>11u');
    expect(disableKittyKeyboard()).toBe('\x1b[<u');
  });

  it('reassembles a CSI u split across chunks', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b[97;1:')).toEqual([]);
    expect(parser.feed('3u').map((k) => k.kind)).toEqual(['release']);
  });

  it('waits for a bracketed paste to end', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b[200~hel')).toEqual([]);
    const [event] = parser.feed('lo\x1b[201~');
    expect(event?.name).toBe('paste');
    expect(event?.paste).toBe('hello');
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

  it('emits OSC 7 working-directory announcement', () => {
    const { stream, buffer } = capture();
    osc.workingDir(stream, '/home/simon/Projects/mudah');
    expect(buffer.value).toBe('\x1b]7;file:///home/simon/Projects/mudah\x07');
  });

  it('guardedOsc no-ops for missing capabilities', () => {
    const { stream, buffer } = capture();
    const guarded = guardedOsc(stream, { osc9: false, osc133: false, osc7: false });
    guarded.notify('T', 'M');
    guarded.promptStart();
    guarded.commandEnd(1);
    guarded.workingDir('/x');
    expect(buffer.value).toBe('');
  });

  it('emits OSC 9;1 progress and OSC 9;2 bell', () => {
    const { stream, buffer } = capture();
    osc.progress(stream, 50);
    osc.progress(stream, 150);
    osc.progress(stream, -4);
    osc.bell(stream);
    expect(buffer.value).toContain('\x1b]9;1;50\x07');
    expect(buffer.value).toContain('\x1b]9;1;100\x07');
    expect(buffer.value).toContain('\x1b]9;1;0\x07');
    expect(buffer.value).toContain('\x1b]9;2\x07');
    expect(buffer.value).not.toContain('\x1f');
  });

  it('guardedOsc always emits progress and bell', () => {
    const { stream, buffer } = capture();
    const guarded = guardedOsc(stream, { osc9: false, osc133: false, osc7: false });
    guarded.progress(25);
    guarded.bell();
    expect(buffer.value).toBe('\x1b]9;1;25\x07\x1b]9;2\x07');
  });

  it('keeps osc.notify on OSC 9 with the unit separator', () => {
    const { stream, buffer } = capture();
    osc.notify(stream, 'Title', 'Done');
    expect(buffer.value).toContain('\x1b]9;Title\x1fDone\x07');
  });

  it('guardedOsc emits workingDir when osc7 is set', () => {
    const { stream, buffer } = capture();
    const guarded = guardedOsc(stream, { osc9: false, osc133: false, osc7: true });
    guarded.workingDir('/home/simon/Projects/mudah');
    expect(buffer.value).toBe('\x1b]7;file:///home/simon/Projects/mudah\x07');
  });
});
