import { describe, expect, it } from 'vitest';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import {
  Column,
  Container,
  Label,
  List,
  Row,
  Split,
  Table,
  TextInput,
  Viewport,
  clipPad,
} from '@mudah-cli/tui';

const key = (name: string, ch?: string): KeyEvent => ({ name, ch });

function mouse(
  x: number,
  y: number,
  extra: Partial<MouseEvent> = {},
): MouseEvent {
  return {
    x,
    y,
    buttons: { left: true, middle: false, right: false, extra: false },
    hover: false,
    release: false,
    drag: false,
    shift: false,
    alt: false,
    ctrl: false,
    ...extra,
  };
}

describe('clipPad', () => {
  it('pads short strings and clips long ones', () => {
    expect(clipPad('ab', 4)).toBe('ab  ');
    expect(clipPad('abcd', 2)).toBe('ab');
    expect(clipPad('', 3)).toBe('   ');
  });
});

describe('Column', () => {
  it('stacks children top to bottom', () => {
    const col = new Column().add(new Label('one'), new Label('two'));
    expect(col.render()).toEqual(['one', 'two']);
  });

  it('is what Container extends', () => {
    const c = new Container().add(new Label('x'));
    expect(c).toBeInstanceOf(Column);
    expect(c.render()).toEqual(['x']);
  });

  it('gives leftover height to a Viewport', () => {
    const viewport = new Viewport(new Label('a\nb\nc\nd\ne'), 1);
    const col = new Column().add(new Label('h'), viewport);
    col.resize(10, 10);
    col.render();
    expect(viewport.height).toBe(9);
    expect(col.render()).toHaveLength(10);
    expect(col.render()[0]).toBe('h');
  });
});

describe('Row', () => {
  it('places children side by side', () => {
    const row = new Row().add(new Label('A'), new Label('B'));
    expect(row.render()).toEqual(['AB']);
  });

  it('gives leftover width to a stretch child', () => {
    const viewport = new Viewport(new Label('inner'), 1);
    const row = new Row().add(new Label('L'), viewport);
    row.resize(10, 1);
    const line = row.render()[0] ?? '';
    expect(line.startsWith('L')).toBe(true);
    expect(line).toContain('inner');
  });
});

describe('Split', () => {
  it('draws a vertical bar between left and right panes', () => {
    const split = new Split({ ratio: 0.5 }).add(new Label('L'), new Label('R'));
    split.resize(21, 2);
    const line = split.render()[0] ?? '';
    expect(line).toContain('│');
    const bar = line.indexOf('│');
    expect(line[0]).toBe('L');
    expect(line[bar + 1]).toBe('R');
  });

  it('draws a horizontal bar between top and bottom panes', () => {
    const split = new Split({ axis: 'vertical', ratio: 0.5 }).add(new Label('T'), new Label('B'));
    split.resize(5, 5);
    const lines = split.render();
    expect(lines).toHaveLength(5);
    expect(lines.some((line) => line.includes('─'))).toBe(true);
    expect(lines.join('\n')).toContain('T');
    expect(lines.join('\n')).toContain('B');
  });

  it('throws when it does not have two children', () => {
    const split = new Split().add(new Label('only'));
    split.resize(10, 4);
    expect(() => split.render()).toThrow(/exactly two children/);
  });

  it('moves the bar when the user drags it', () => {
    const split = new Split({ ratio: 0.5 }).add(new Label('L'), new Label('R'));
    split.resize(21, 3);
    split.render();
    const barX = (split.render()[0] ?? '').indexOf('│');
    expect(barX).toBeGreaterThan(0);
    expect(split.handleMouse(mouse(barX, 0))).toBe(true);
    expect(split.handleMouse(mouse(4, 1, { drag: true }))).toBe(true);
    expect(split.ratio).toBeCloseTo(4 / 20);
    const next = (split.render()[0] ?? '').indexOf('│');
    expect(next).toBe(4);
  });
});

describe('nested focus', () => {
  it('tabs through focusable leaves inside a Row', () => {
    const a = new TextInput();
    const b = new TextInput();
    const root = new Container().add(new Label('title'), new Row().add(a, b));
    expect(root.focused).toBe(a);
    root.handleKey(key('tab'));
    expect(root.focused).toBe(b);
    root.handleKey(key('shift-tab'));
    expect(root.focused).toBe(a);
  });

  it('types into the focused leaf across the row', () => {
    const a = new TextInput();
    const b = new TextInput();
    const root = new Row().add(a, b);
    root.handleKey(key('x', 'x'));
    expect(a.value).toBe('x');
    expect(b.value).toBe('');
    root.handleKey(key('tab'));
    root.handleKey(key('y', 'y'));
    expect(b.value).toBe('y');
  });
});

describe('2D mouse hit-testing', () => {
  it('delivers a click to the right-hand pane', () => {
    const table = new Table([{ header: 'n' }], [['a'], ['b'], ['c']]);
    const row = new Row().add(new Label('L'), table);
    row.resize(40, 10);
    row.render();
    // Label is 1 cell; the table stretches into the rest.
    row.handleMouse(mouse(5, 4));
    expect(table.selectedIndex).toBe(1);
  });

  it('does not hit a widget in the other pane', () => {
    const left = new Table([{ header: 'l' }], [['a'], ['b']]);
    const right = new Table([{ header: 'r' }], [['x'], ['y']]);
    const split = new Split({ ratio: 0.5 }).add(left, right);
    split.resize(21, 8);
    split.render();
    const bar = (split.render()[0] ?? '').indexOf('│');
    split.handleMouse(mouse(bar + 2, 4));
    expect(right.selectedIndex).toBeGreaterThanOrEqual(0);
    expect(left.selectedIndex).toBe(0);
  });
});

describe('List still stacks in a Column', () => {
  it('keeps the old Container contract for keys', () => {
    const list = new List(['a', 'b']);
    const c = new Container().add(new Label('h'), list);
    expect(c.focused).toBe(list);
    c.handleKey(key('down'));
    expect(list.selectedIndex).toBe(1);
  });
});
