import { describe, expect, it } from 'vitest';
import {
  disableMouse,
  enableMouse,
  isMouseEvent,
  parseKeys,
  KeyParser,
  parseMouseEvents,
} from '@mudah-cli/terminal';

describe('parseMouseEvents — SGR 1006', () => {
  it('decodes a left press at 1,1 as 0,0', () => {
    const [event] = parseMouseEvents('\x1b[<0;1;1M');
    expect(event?.x).toBe(0);
    expect(event?.y).toBe(0);
    expect(event?.buttons.left).toBe(true);
    expect(event?.release).toBe(false);
  });

  it('decodes a left release (final m)', () => {
    const [event] = parseMouseEvents('\x1b[<0;1;1m');
    expect(event?.release).toBe(true);
    expect(event?.buttons.left).toBe(false);
  });

  it('decodes middle and right buttons', () => {
    expect(parseMouseEvents('\x1b[<1;5;5M')[0]?.buttons.middle).toBe(true);
    expect(parseMouseEvents('\x1b[<2;5;5M')[0]?.buttons.right).toBe(true);
  });

  it('decodes the wheel', () => {
    expect(parseMouseEvents('\x1b[<64;1;1M')[0]?.wheel).toBe('up');
    expect(parseMouseEvents('\x1b[<65;1;1M')[0]?.wheel).toBe('down');
  });

  it('decodes modifiers', () => {
    expect(parseMouseEvents('\x1b[<4;1;1M')[0]?.shift).toBe(true);
    expect(parseMouseEvents('\x1b[<8;1;1M')[0]?.alt).toBe(true);
    expect(parseMouseEvents('\x1b[<16;1;1M')[0]?.ctrl).toBe(true);
  });

  it('marks drag motion', () => {
    const [event] = parseMouseEvents('\x1b[<32;9;9M');
    expect(event?.drag).toBe(true);
    expect(event?.buttons.left).toBe(true);
  });

  it('handles wide terminals that X10 cannot express', () => {
    const [event] = parseMouseEvents('\x1b[<0;300;120M');
    expect(event?.x).toBe(299);
    expect(event?.y).toBe(119);
  });

  it('decodes several events in one chunk', () => {
    const events = parseMouseEvents('\x1b[<0;1;1M\x1b[<0;1;1m');
    expect(events).toHaveLength(2);
    expect(events[0]?.release).toBe(false);
    expect(events[1]?.release).toBe(true);
  });

  it('returns nothing for plain keyboard input', () => {
    expect(parseMouseEvents('a')).toEqual([]);
    expect(parseMouseEvents('\x1b[A')).toEqual([]);
  });
});

describe('parseMouseEvents — X10', () => {
  it('decodes a press with 32-offset coordinates', () => {
    const [event] = parseMouseEvents('\x1b[M !!');
    expect(event?.buttons.left).toBe(true);
    expect(event?.x).toBe(0);
    expect(event?.y).toBe(0);
  });

  it('returns nothing for keyboard input', () => {
    expect(parseMouseEvents('\x1b[M')).toEqual([]);
  });
});

describe('parseMouseEvents — urxvt 1015', () => {
  it('decodes a press', () => {
    const [event] = parseMouseEvents('\x1b[32;1;1M');
    expect(event?.buttons.left).toBe(true);
    expect(event?.x).toBe(0);
  });
});

describe('isMouseEvent', () => {
  it('recognizes mouse reports', () => {
    expect(isMouseEvent('\x1b[<0;1;1M')).toBe(true);
    expect(isMouseEvent('\x1b[M !!')).toBe(true);
  });

  it('rejects keyboard input', () => {
    expect(isMouseEvent('\x1b[A')).toBe(false);
    expect(isMouseEvent('a')).toBe(false);
  });
});

describe('mouse and keyboard do not collide', () => {
  it('parseKeys ignores a mouse report', () => {
    // Without this, a click would reach the app as a stray escape key.
    expect(parseKeys('\x1b[<0;1;1M')).toEqual([]);
  });

  it('KeyParser ignores a mouse report', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b[<0;1;1M')).toEqual([]);
  });

  it('KeyParser still emits real keys', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b[A')[0]?.name).toBe('up');
    expect(parser.feed('a')[0]?.name).toBe('a');
  });

  it('waits for a mouse report split across chunks', () => {
    const parser = new KeyParser();
    expect(parser.feed('\x1b[<0;1')).toEqual([]);
    // The completed report is still not a key event.
    expect(parser.feed(';1M')).toEqual([]);
  });

  it('does not corrupt the parser for keys after a click', () => {
    const parser = new KeyParser();
    parser.feed('\x1b[<0;1;1M');
    expect(parser.feed('\x1b[B')[0]?.name).toBe('down');
  });
});

describe('mouse modes', () => {
  it('enables SGR by default', () => {
    expect(enableMouse()).toBe('\x1b[?1000h\x1b[?1006h');
  });

  it('enables drag and motion tracking on request', () => {
    const all = enableMouse({ drag: true, motion: true });
    expect(all).toContain('\x1b[?1002h');
    expect(all).toContain('\x1b[?1003h');
    expect(all).toContain('\x1b[?1006h');
  });

  it('disables with the matching reset sequences', () => {
    expect(disableMouse()).toBe('\x1b[?1000l\x1b[?1006l');
  });

  it('symmetrically enables and disables', () => {
    const options = { drag: true };
    expect(disableMouse(options)).toBe(enableMouse(options).replace(/h$/, 'l').replace(/h(?=\x1b)/g, 'l'));
  });
});
