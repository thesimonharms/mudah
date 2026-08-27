import { describe, expect, it } from 'vitest';
import type { KeyEvent } from '@mudah-cli/terminal';
import {
  Container,
  DiffRenderer,
  Label,
  List,
  MultiList,
  Program,
  ScreenBuffer,
  TextInput,
} from '@mudah-cli/tui';

const key = (name: string, ch?: string): KeyEvent => ({ name, ch });

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
    expect(second).toContain('ax');
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
    expect(session.out()).toContain('▸ x');
    session.quit();
    const { code } = await session;
    expect(code).toBe(0);
  });

  it('diff paints when the tree changes between frames', async () => {
    const label = new Label('before');
    const container = new Container().add(label);
    const session = headless(container);
    await new Promise((r) => setTimeout(r, 30));
    label.setText('after');
    await new Promise((r) => setTimeout(r, 30));
    session.quit();
    const { code } = await session;
    expect(code).toBe(0);
    expect(session.out()).toContain('before');
    expect(session.out()).toContain('after');
  });
});
