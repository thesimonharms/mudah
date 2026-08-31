import { describe, expect, it } from 'vitest';
import type { KeyEvent } from '@mudah-cli/terminal';
import { TextArea } from '@mudah-cli/tui';

const key = (name: string, ch?: string): KeyEvent => ({ name, ch: ch ?? undefined });

function typeChar(area: TextArea, ch: string): void {
  area.onKey(key(ch, ch));
}

describe('TextArea', () => {
  it('starts with one empty line', () => {
    const area = new TextArea();
    expect(area.lines).toEqual(['']);
    expect(area.value).toBe('');
    expect(area.row).toBe(0);
    expect(area.col).toBe(0);
  });

  it('types characters and inserts newlines', () => {
    const area = new TextArea();
    typeChar(area, 'a');
    typeChar(area, 'b');
    expect(area.lines).toEqual(['ab']);
    area.onKey(key('enter'));
    typeChar(area, 'c');
    expect(area.lines).toEqual(['ab', 'c']);
    expect(area.row).toBe(1);
    expect(area.col).toBe(1);
  });

  it('merges lines on backspace at the start of a line', () => {
    const area = new TextArea();
    typeChar(area, 'a');
    area.onKey(key('enter'));
    typeChar(area, 'b');
    expect(area.lines).toEqual(['a', 'b']);
    // Home (col=0) then backspace merges the two lines.
    area.onKey(key('home'));
    area.onKey(key('backspace'));
    expect(area.lines).toEqual(['ab']);
    expect(area.row).toBe(0);
    expect(area.col).toBe(1);
  });

  it('deletes the previous char on backspace within a line', () => {
    const area = new TextArea();
    typeChar(area, 'a');
    typeChar(area, 'b');
    area.onKey(key('backspace'));
    expect(area.lines).toEqual(['a']);
    expect(area.col).toBe(1);
  });

  it('moves the caret up and down across rows, clamping the column', () => {
    const area = new TextArea();
    for (const ch of 'abc') typeChar(area, ch);
    area.onKey(key('enter'));
    for (const ch of 'de') typeChar(area, ch);
    // From "de" (col=2) move up — col clamps to the "abc" line length (3).
    area.onKey(key('up'));
    expect(area.row).toBe(0);
    expect(area.col).toBe(2);
    area.onKey(key('down'));
    expect(area.row).toBe(1);
    expect(area.col).toBe(2);
  });

  it('home/end jump to the line bounds; left/right wrap rows', () => {
    const area = new TextArea();
    for (const ch of 'ab') typeChar(area, ch);
    area.onKey(key('enter'));
    typeChar(area, 'c');
    area.onKey(key('home'));
    expect(area.col).toBe(0);
    area.onKey(key('end'));
    expect(area.col).toBe(1);
    // Right at the end of the buffer is a no-op (no phantom line created).
    area.onKey(key('right'));
    expect(area.row).toBe(1);
    expect(area.col).toBe(1);
    // Insert a third line, then right at end-of-line wraps to it.
    area.onKey(key('enter'));
    typeChar(area, 'd');
    area.onKey(key('up'));
    area.onKey(key('end'));
    area.onKey(key('right'));
    expect(area.row).toBe(2);
    expect(area.col).toBe(0);
    area.onKey(key('left'));
    expect(area.row).toBe(1);
    expect(area.col).toBe(1);
  });

  it('preserves newlines in a paste event', () => {
    const area = new TextArea();
    area.onKey({ name: 'paste', paste: 'a\nb\nc' });
    expect(area.lines).toEqual(['a', 'b', 'c']);
    expect(area.row).toBe(2);
    expect(area.col).toBe(1);
  });

  it('renders only the visible window and scrolls with the caret', () => {
    const area = new TextArea();
    area.visibleRows = 2;
    area.value = ['a', 'b', 'c', 'd', 'e'].join('\n');
    // Caret sits on "e" (row 4); window of 2 must center on it: rows 3 and 4.
    area.row = 4;
    expect(area.render()).toEqual(['d', 'e']);
  });

  it('updates its value and fires onChange', () => {
    const seen: string[] = [];
    const area = new TextArea();
    area.onChange = (value) => seen.push(value);
    typeChar(area, 'a');
    typeChar(area, 'b');
    expect(area.value).toBe('ab');
    expect(seen).toEqual(['a', 'ab']);
  });

  it('is focusable', () => {
    expect(new TextArea().focusable).toBe(true);
  });
});
