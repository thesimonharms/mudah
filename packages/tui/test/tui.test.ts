import { describe, expect, it } from 'vitest';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import {
  Container,
  DiffRenderer,
  FileBrowser,
  Label,
  List,
  MenuBar,
  MultiList,
  Overlay,
  Panel,
  Program,
  ScreenBuffer,
  Table,
  TextInput,
  Viewport,
} from '@mudah-cli/tui';
import { EventEmitter } from 'node:events';

const key = (name: string, ch?: string): KeyEvent => ({ name, ch });

const click = (x: number, y: number): MouseEvent => ({
  x,
  y,
  buttons: { left: true, middle: false, right: false, extra: false },
  hover: false,
  release: false,
  drag: false,
  shift: false,
  alt: false,
  ctrl: false,
});

const wheel = (direction: 'up' | 'down'): MouseEvent => ({
  x: 0,
  y: 0,
  buttons: { left: false, middle: false, right: false, extra: false },
  hover: false,
  release: false,
  drag: false,
  shift: false,
  alt: false,
  ctrl: false,
  wheel: direction,
});

describe('ScreenBuffer', () => {
  it('sets cells and renders trimmed rows', () => {
    const buffer = new ScreenBuffer(10, 2);
    buffer.setLines(['hello', 'world']);
    expect(buffer.toLines()).toEqual(['hello', 'world']);
  });

  it('pads short lines and clips out-of-bounds writes', () => {
    const buffer = new ScreenBuffer(5, 2);
    buffer.setCell(0, 0, 'a');
    buffer.setCell(-1, 0, 'x');
    buffer.setCell(99, 0, 'y');
    expect(buffer.toLines()[0]).toBe('a');
    expect(buffer.toLines()[1]).toBe('');
  });

  it('tracks style tags per cell', () => {
    const buffer = new ScreenBuffer(3, 1);
    buffer.setCell(0, 0, 'e', 'error');
    expect(buffer.getCell(0, 0)).toEqual({ char: 'e', style: 'error' });
    expect(buffer.getCell(1, 0).style).toBe('');
  });
});

describe('DiffRenderer', () => {
  function makeStream(): { stream: { write(data: string): void }; written: string[]; text: () => string } {
    const written: string[] = [];
    return {
      stream: { write(data: string): void { written.push(data); } },
      written,
      text: () => written.join(''),
    };
  }

  it('paints the full frame first, then only changed rows', () => {
    const { stream, text, written } = makeStream();
    const renderer = new DiffRenderer();

    const a = new ScreenBuffer(4, 2);
    a.setLines(['ab', 'cd']);
    renderer.paint(stream, a);
    const first = text();
    // New renderer homes via absolute addressing on the first changed row.
    expect(first).toContain('\x1b[1;1H');
    expect(first).toContain('ab');
    expect(first).toContain('cd');

    // Change row 0 only.
    const b = new ScreenBuffer(4, 2);
    b.setLines(['ax', 'cd']);
    renderer.paint(stream, b);
    const second = written[1] ?? '';
    expect(second).toContain('x');
    expect(second).not.toContain('cd');
  });

  it('emits nothing when nothing changed', () => {
    const { stream, text } = makeStream();
    const renderer = new DiffRenderer();
    const a = new ScreenBuffer(4, 1);
    a.setLines(['same']);
    renderer.paint(stream, a);
    const afterFirst = text().length;
    renderer.paint(stream, a);
    expect(text().length).toBe(afterFirst);
  });

  it('reset() forces a full repaint', () => {
    const { stream, written } = makeStream();
    const renderer = new DiffRenderer();
    const a = new ScreenBuffer(4, 1);
    a.setLines(['x']);
    renderer.paint(stream, a);
    renderer.reset();
    renderer.paint(stream, a);
    expect(written.length).toBe(2);
    expect(written[1]).toContain('x');
  });
});

describe('widgets', () => {
  it('Label renders its text', () => {
    expect(new Label('hi\nthere').render()).toEqual(['hi', 'there']);
  });

  it('List moves and selects with keys', () => {
    let picked: number | undefined;
    const list = new List(['a', 'b', 'c'], (i) => {
      picked = i;
    });
    list.onKey(key('down'));
    expect(list.render()[1]).toContain('▸ b');
    list.onKey(key('enter'));
    expect(picked).toBe(1);
  });

  it('List clamps at bounds', () => {
    const list = new List(['a', 'b']);
    list.onKey(key('up'));
    expect(list.selectedIndex).toBe(0);
    list.onKey(key('down'));
    list.onKey(key('down'));
    expect(list.selectedIndex).toBe(1);
  });

  it('MultiList toggles with space and submits sorted picks on enter', () => {
    let submitted: number[] = [];
    const multi = new MultiList(['a', 'b', 'c'], (indices) => {
      submitted = indices;
    });
    multi.onKey(key('space')); // check 0
    multi.onKey(key('down'));
    multi.onKey(key('space')); // check 1
    multi.onKey(key('up'));
    multi.onKey(key('down'));
    multi.onKey(key('down'));
    multi.onKey(key('space')); // check 2
    multi.onKey(key('enter'));
    expect(submitted).toEqual([0, 1, 2]);
    expect(multi.render()[1]).toContain('[x] b');
  });

  it('TextInput accepts printable chars and backspace', () => {
    let got = '';
    const input = new TextInput((v) => {
      got = v;
    });
    for (const ch of 'hey') input.onKey(key(ch, ch));
    expect(input.value).toBe('hey');
    input.onKey(key('backspace'));
    expect(input.value).toBe('he');
    input.onKey(key('enter'));
    expect(got).toBe('he');
    // Control chars are ignored.
    input.onKey(key('up'));
    expect(input.value).toBe('he');
  });
});

describe('Container focus cycling', () => {
  function arrows(): Container {
    const c = new Container();
    c.add(new TextInput(), new TextInput());
    return c;
  }

  it('focuses the first focusable child initially', () => {
    const c = new Container();
    const label = new Label('static');
    const input = new TextInput();
    c.add(label, input);
    expect(c.focused).toBe(input);
  });

  it('tab cycles forward, shift-tab cycles backward', () => {
    const c = arrows();
    const [first, second] = c.components as [TextInput, TextInput];
    expect(c.focused).toBe(first);
    c.handleKey(key('tab'));
    expect(c.focused).toBe(second);
    c.handleKey(key('shift-tab'));
    expect(c.focused).toBe(first);
  });

  it('ignores key-up so a release does not cycle focus', () => {
    const c = arrows();
    const [first] = c.components as [TextInput, TextInput];
    expect(c.focused).toBe(first);
    c.handleKey({ name: 'tab', kind: 'release' });
    expect(c.focused).toBe(first);
  });

  it('routes keys to the focused component only', () => {
    const c = arrows();
    const [first, second] = c.components as [TextInput, TextInput];
    c.handleKey(key('a', 'a'));
    expect(first.value).toBe('a');
    expect(second.value).toBe('');
    c.handleKey(key('tab'));
    c.handleKey(key('b', 'b'));
    expect(second.value).toBe('b');
    expect(first.value).toBe('a');
  });

  it('renders children in order', () => {
    const c = new Container();
    c.add(new Label('one'), new Label('two'));
    expect(c.render()).toEqual(['one', 'two']);
  });
});

describe('Program (headless)', () => {
  interface Headless {
    stdout: { write(data: string): unknown; isTTY?: boolean };
    out: () => string;
    quit: () => void;
  }

  function headless(container: Container): Promise<{ code: number; program: Program }> & Headless {
    const chunks: string[] = [];
    const stdout = {
      isTTY: false,
      write(data: string): void {
        chunks.push(String(data));
      },
    };
    const program = new Program({ stdout, frameMs: 5, inline: true });
    program.mount(container);

    const promise = program.run().then((code) => ({ code, program }));
    return Object.assign(promise, {
      stdout,
      out: () => chunks.join(''),
      quit: () => program.quit(),
    });
  }

  it('paints immediately and resolves when quit() is called', async () => {
    const container = new Container().add(new Label('mudah tui'), new List(['x', 'y']));
    const session = headless(container);
    await new Promise((r) => setTimeout(r, 30));
    expect(session.out()).toContain('mudah tui');
    expect(session.out()).toContain('▸');
    expect(session.out()).toContain('x');
    session.quit();
    const { code } = await session;
    expect(code).toBe(0);
  });

  it('diff paints when the tree changes between frames', async () => {
    const label = new Label('before');
    const container = new Container().add(label);
    const session = headless(container);
    await new Promise((r) => setTimeout(r, 30));
    const first = session.out();
    expect(first).toContain('before');
    label.setText('after');
    await new Promise((r) => setTimeout(r, 30));
    session.quit();
    const { code } = await session;
    expect(code).toBe(0);
    // Cell-level diff skips the shared 'r' in before/after, so the second
    // paint is the changed prefix plus a trailing space, not the word "after".
    expect(session.out().length).toBeGreaterThan(first.length);
    expect(session.out().slice(first.length)).toContain('afte');
  });

  it('routes keystrokes from stdin to the mounted tree', async () => {
    const emitter = new EventEmitter();
    const stdin = emitter as unknown as NodeJS.ReadStream;
    Object.assign(stdin, {
      isTTY: true,
      setRawMode: () => {},
      resume: () => {},
      pause: () => {},
    });
    const list = new List(['a', 'b', 'c']);
    let picked = '';
    const overlay = new Overlay(new Container().add(list));
    overlay.setPalette([{ id: 'go', label: 'Go now' }], (id) => {
      picked = id;
    });
    const program = new Program({
      stdin,
      stdout: { isTTY: true, columns: 40, rows: 10, write: () => {} },
      frameMs: 5,
      inline: true,
    });
    program.mount(overlay);
    const run = program.run();
    await new Promise((r) => setTimeout(r, 20));
    emitter.emit('data', '\x1b[B');
    await new Promise((r) => setTimeout(r, 20));
    expect(list.selectedIndex).toBe(1);
    emitter.emit('data', '\x0b');
    await new Promise((r) => setTimeout(r, 20));
    expect(overlay.render().join('\n')).toContain('Go now');
    emitter.emit('data', '\r');
    await new Promise((r) => setTimeout(r, 20));
    expect(picked).toBe('go');
    program.quit();
    expect(await run).toBe(0);
  });
});

describe('Table', () => {
  const columns = [{ header: 'name' }, { header: 'size', align: 'right' as const }];
  const rows = [
    ['alpha', '10'],
    ['beta', '20'],
    ['gamma', '30'],
  ];

  it('renders a grid with a selection marker', () => {
    const table = new Table(columns, rows);
    const rendered = table.render();
    expect(rendered.join('\n')).toContain('name');
    expect(rendered.join('\n')).toContain('beta');
    expect(rendered.some((line) => line.includes('▸'))).toBe(true);
  });

  it('moves the selection with the arrow keys', () => {
    const table = new Table(columns, rows);
    expect(table.selectedIndex).toBe(0);
    table.onKey(key('down'));
    expect(table.selectedIndex).toBe(1);
    table.onKey(key('up'));
    expect(table.selectedIndex).toBe(0);
  });

  it('stops at the ends', () => {
    const table = new Table(columns, rows);
    table.onKey(key('up'));
    expect(table.selectedIndex).toBe(0);
    table.selectedIndex = rows.length - 1;
    table.onKey(key('down'));
    expect(table.selectedIndex).toBe(rows.length - 1);
  });

  it('reports the selected row on enter', () => {
    const picked: number[] = [];
    const table = new Table(columns, rows, (index) => picked.push(index));
    table.onKey(key('down'));
    table.onKey(key('enter'));
    expect(picked).toEqual([1]);
  });

  it('scrolls with the mouse wheel', () => {
    const table = new Table(columns, rows);
    expect(table.onMouse(wheel('down'))).toBe(true);
    expect(table.selectedIndex).toBe(1);
    expect(table.onMouse(wheel('up'))).toBe(true);
    expect(table.selectedIndex).toBe(0);
  });

  it('selects the row that was clicked', () => {
    const table = new Table(columns, rows);
    // Row 0 is the top border, 1 the header, 2 the rule: row 3 is data 0.
    expect(table.onMouse(click(0, 4))).toBe(true);
    expect(table.selectedIndex).toBe(1);
  });

  it('clamps clicks outside the data area', () => {
    const table = new Table(columns, rows);
    expect(table.onMouse(click(0, 0))).toBe(false);
    expect(table.selectedIndex).toBe(0);
  });

  it('windows long tables to the viewport height', () => {
    const many = Array.from({ length: 50 }, (_, i) => [`row-${i}`, `${i}`]);
    const table = new Table(columns, many);
    table.viewportHeight = 8;
    expect(table.render().length).toBeLessThanOrEqual(8);
    table.selectedIndex = 40;
    const rendered = table.render().join('\n');
    expect(rendered).toContain('row-40');
    expect(rendered).not.toContain('row-0');
  });
});

describe('Panel', () => {
  it('draws a titled box', () => {
    const panel = new Panel('Deploy', ['staging', 'production']);
    const rendered = panel.render().join('\n');
    expect(rendered).toContain('Deploy');
    expect(rendered).toContain('staging');
    expect(rendered).toContain('production');
  });

  it('draws an untitled box', () => {
    const rendered = new Panel(undefined, ['x']).render().join('\n');
    expect(rendered).toContain('x');
  });

  it('is not focusable', () => {
    expect(new Panel('t', []).focusable).toBe(false);
  });

  it('swaps its body', () => {
    const panel = new Panel('t', ['before']);
    panel.setBody(['after']);
    const rendered = panel.render().join('\n');
    expect(rendered).toContain('after');
    expect(rendered).not.toContain('before');
  });
});

describe('Viewport', () => {
  const longLines = Array.from({ length: 20 }, (_, i) => `line-${i}`);

  it('shows only the top slice at first', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    const rendered = viewport.render();
    expect(rendered).toEqual(['line-0', 'line-1', 'line-2', 'line-3', 'line-4']);
  });

  it('scrolls down with the arrow keys', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    viewport.onKey(key('down'));
    expect(viewport.scrollTop).toBe(1);
    expect(viewport.render()[0]).toBe('line-1');
  });

  it('refuses to scroll past the end', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    expect(viewport.maxScroll).toBe(15);
    viewport.onKey(key('end'));
    expect(viewport.scrollTop).toBe(15);
    viewport.onKey(key('down'));
    expect(viewport.scrollTop).toBe(15);
  });

  it('pages and jumps home', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    viewport.onKey(key('page-down'));
    expect(viewport.scrollTop).toBe(5);
    viewport.onKey(key('home'));
    expect(viewport.scrollTop).toBe(0);
  });

  it('scrolls with the wheel', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    expect(viewport.onMouse(wheel('down'))).toBe(true);
    expect(viewport.scrollTop).toBe(1);
    expect(viewport.onMouse(wheel('up'))).toBe(true);
    expect(viewport.scrollTop).toBe(0);
  });

  it('always fills its declared height', () => {
    const viewport = new Viewport(new Label('only-one'), 4);
    expect(viewport.render()).toHaveLength(4);
  });

  it('reports its height for layout', () => {
    expect(new Viewport(new Label('x'), 7).height).toBe(7);
  });

  it('forwards unhandled keys to its child', () => {
    const list = new List(['a', 'b']);
    const viewport = new Viewport(list, 5);
    expect(viewport.onKey(key('enter'))).toBe(true);
  });

  it('resizes without losing the scroll position', () => {
    const viewport = new Viewport(new Label(longLines.join('\n')), 5);
    viewport.scrollTo(10);
    viewport.setHeight(8);
    expect(viewport.render()).toHaveLength(8);
    expect(viewport.scrollTop).toBe(10);
  });
});

describe('mouse routing', () => {
  it('delivers a click to the child under the cursor', () => {
    const list = new List(['a', 'b', 'c']);
    const container = new Container().add(new Label('header'), list);
    // The label occupies row 0, so the list starts at row 1. Local y=1 is 'b'.
    expect(container.handleMouse(click(0, 2))).toBe(true);
    expect(list.selectedIndex).toBe(1);
  });

  it('translates coordinates into the child space', () => {
    const table = new Table([{ header: 'name' }], [['a'], ['b'], ['c']]);
    const container = new Container().add(new Label('header'), table);
    // Table starts at row 1, so its local row 3 (data 0) is global row 4.
    container.handleMouse(click(0, 4));
    expect(table.selectedIndex).toBe(0);
  });

  it('ignores clicks below every child', () => {
    const container = new Container().add(new Label('only'));
    expect(container.handleMouse(click(0, 50))).toBe(false);
  });
});

describe('FileBrowser', () => {
  it('loads and renders directory entries', async () => {
    const adapter = {
      async readdir(p: string) {
        if (p === '.') return ['src', 'readme.md'];
        if (p === './src') return ['index.ts'];
        return [];
      },
      async isDir(p: string) {
        return p === '.' || p === './src' || p === 'src';
      },
    };
    const browser = new FileBrowser();
    await browser.load(adapter);
    const lines = browser.render();
    expect(lines.length).toBe(2);
    expect(lines.join('\n')).toContain('src');
    expect(lines.join('\n')).toContain('readme.md');
    expect(lines.join('\n')).not.toContain('index.ts');
    browser.onKey({ name: 'space' });
    for (let i = 0; i < 20; i++) {
      if (browser.render().join('\n').includes('index.ts')) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(browser.render().join('\n')).toContain('index.ts');
    expect(browser.render().join('\n')).toContain('▼');
  });

  it('navigates with arrow keys', async () => {
    const adapter = {
      async readdir() { return ['a.ts', 'b.ts']; },
      async isDir() { return false; },
    };
    const browser = new FileBrowser();
    await browser.load(adapter);
    expect(browser.selectedIndex).toBe(0);
    browser.onKey({ name: 'down', ch: '\x1b[B' });
    expect(browser.selectedIndex).toBe(1);
    browser.onKey({ name: 'up', ch: '\x1b[A' });
    expect(browser.selectedIndex).toBe(0);
  });

  it('calls onSelect when a file is selected', async () => {
    let selected = '';
    const adapter = {
      async readdir() { return ['file.txt']; },
      async isDir() { return false; },
    };
    const browser = new FileBrowser({ onSelect: (p) => { selected = p; } });
    await browser.load(adapter);
    browser.onKey({ name: 'enter', ch: '\r' });
    expect(selected).toBe('file.txt');
  });
});

describe('MenuBar', () => {
  it('renders menu labels', () => {
    const bar = new MenuBar({
      items: [
        { label: 'File', items: [{ label: 'Open', onSelect: () => {} }] },
        { label: 'Edit' },
      ],
    });
    const lines = bar.render();
    expect(lines[0]).toContain('F\u0332ile');
    expect(lines[0]).toContain('E\u0332dit');
  });

  it('navigates left/right', () => {
    const bar = new MenuBar({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
    bar.onKey({ name: 'right', ch: '\x1b[C' });
    bar.onKey({ name: 'right', ch: '\x1b[C' });
    const lines = bar.render();
    expect(lines[0]).toContain('C');
    expect(lines[0]).toMatch(/\[C/);
  });

  it('opens a menu from an alt access key', () => {
    const bar = new MenuBar({
      items: [
        { label: 'File', items: [{ label: 'Open', onSelect: () => undefined }] },
        { label: 'Edit' },
      ],
    });
    expect(bar.onKey({ name: 'f', ch: 'f', alt: true })).toBe(true);
    expect(bar.render().length).toBe(2);
  });

  it('opens and closes dropdown', () => {
    let called = false;
    const bar = new MenuBar({
      items: [
        { label: 'File', items: [{ label: 'Save', onSelect: () => { called = true; } }] },
      ],
    });
    bar.onKey({ name: 'enter', ch: '\r' }); // open
    expect(bar.render().length).toBe(2); // header + 1 item
    bar.onKey({ name: 'enter', ch: '\r' }); // select
    expect(called).toBe(true);
    expect(bar.render().length).toBe(1); // closed
  });

  it('closes on escape', () => {
    const bar = new MenuBar({
      items: [{ label: 'X', items: [{ label: 'Y', onSelect: () => {} }] }],
    });
    bar.onKey({ name: 'enter', ch: '\r' });
    expect(bar.render().length).toBe(2);
    bar.onKey({ name: 'escape', ch: '\x1b' });
    expect(bar.render().length).toBe(1);
  });
});
