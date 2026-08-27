import { describe, expect, it } from 'vitest';
import { KeyParser, type KeyEvent } from '@mudah-cli/terminal';

const key = (name: string, ch?: string): KeyEvent => ({ name, ch });

describe('KeyParser prompt-chord coverage', () => {
  // Prompts parse raw chunks with KeyParser; these are the sequences the
  // interactive UIs depend on.
  const parser = new KeyParser();
  const names = (s: string) => parser.feed(s).map((k) => k.name);

  it('covers every key the raw picker binds', () => {
    // A lone ESC at a chunk boundary is the escape key (immediate cancel).
    expect(names('\x1b')).toEqual(['escape']);
    expect(names('a')).toEqual(['a']);
  });

  it('covers every key the raw picker binds (full set)', () => {
    const fresh = new KeyParser();
    const all = (s: string) => fresh.feed(s).map((k) => k.name);
    expect(all('\x1b[A')).toEqual(['up']);
    expect(all('\x1b[B')).toEqual(['down']);
    expect(all(' ')).toEqual(['space']);
    expect(all('\r')).toEqual(['enter']);
    expect(all('\x03')).toEqual(['ctrl+c']);
    expect(all('\x7f')).toEqual(['backspace']);
    expect(all('\x1b')).toEqual(['escape']);
  });
});

// Prompts.prompt/harness helpers below drive Prompts without a TTY by using
// forced values plus the numbered fallback paths.
describe('Prompts non-interactive behavior', () => {
  it('forced values bypass all interaction', async () => {
    const { Prompts } = await import('@mudah-cli/console');
    const p = new Prompts();
    expect(await p.ask('Name', { forcedValue: 'ada' })).toBe('ada');
    expect(await p.confirm('Go?', { forcedValue: 'y' })).toBe(true);
    expect(await p.confirm('Go?', { forcedValue: 'nope' })).toBe(false);
    expect(await p.password('Pass', { forcedValue: 's3cret' })).toBe('s3cret');
    expect(await p.selectIndex('Pick', ['a', 'b'], { forcedValue: '2' })).toEqual({ index: 1, value: 'b' });
    await expect(p.selectIndex('Pick', ['a'], { forcedValue: '9' })).rejects.toThrow(/out of range/);
  });

  it('multiselect forced value accepts comma-separated indices', async () => {
    const { Prompts } = await import('@mudah-cli/console');
    const p = new Prompts();
    expect(await p.multiselect('Pick', ['a', 'b', 'c'], { forcedValue: '3,1' })).toEqual(['a', 'c']);
    expect(await p.multiSelectIndices('Pick', ['a', 'b', 'c'], { forcedValue: '2' })).toEqual([1]);
    // Out-of-range entries are dropped; duplicates collapse.
    expect(await p.multiSelectIndices('Pick', ['a', 'b'], { forcedValue: '1,9,1' })).toEqual([0]);
    expect(await p.multiSelectIndices('Pick', ['a', 'b'], { forcedValue: '' })).toEqual([]);
  });

  it('select/multiselect require at least one choice', async () => {
    const { Prompts } = await import('@mudah-cli/console');
    const p = new Prompts();
    await expect(p.select('Pick', [])).rejects.toThrow(/at least one choice/);
    await expect(p.multiselect('Pick', [], { forcedValue: '' })).rejects.toThrow(/at least one choice/);
  });

  it('numbered fallback renders a menu and accepts an index via stdin', async () => {
    const { Prompts } = await import('@mudah-cli/console');
    const written: string[] = [];
    const output = { write(data: string): void { written.push(data); } } as unknown as NodeJS.WritableStream;

    // Fake non-TTY input delivering "2\n".
    const listeners = new Set<(chunk: Buffer | string) => void>();
    const input = {
      isTTY: false,
      on(event: string, fn: (chunk: Buffer | string) => void): void {
        if (event === 'data') listeners.add(fn);
      },
      off(event: string, fn: (chunk: Buffer | string) => void): void {
        if (event === 'data') listeners.delete(fn);
      },
      resume(): void {},
      pause(): void {},
    } as unknown as NodeJS.ReadStream;
    setTimeout(() => listeners.forEach((fn) => fn('2\n')), 10);

    const p = new Prompts();
    const result = await p.selectIndex('Pick one', ['alpha', 'beta'], { input, output });
    expect(result).toEqual({ index: 1, value: 'beta' });
    expect(written.join('')).toContain('1. alpha');
    expect(written.join('')).toContain('2. beta');
  });

  it('raw picker drives the arrow-key UI through a fake TTY stream', async () => {
    const { Prompts } = await import('@mudah-cli/console');
    const written: string[] = [];
    const output = { write(data: string): void { written.push(data); } } as unknown as NodeJS.WritableStream;
    let rawMode = false;
    const listeners = new Set<(chunk: Buffer | string) => void>();
    const input = {
      isTTY: true,
      get isRaw(): boolean {
        return rawMode;
      },
      setRawMode(on: boolean): void {
        rawMode = on;
      },
      on(event: string, fn: (chunk: Buffer | string) => void): void {
        if (event === 'data') listeners.add(fn);
      },
      off(event: string, fn: (chunk: Buffer | string) => void): void {
        if (event === 'data') listeners.delete(fn);
      },
      resume(): void {},
      pause(): void {},
    } as unknown as NodeJS.ReadStream;

    const p = new Prompts();
    const pending = p.multiSelectIndices('Features', ['a', 'b', 'c'], { input, output });
    await new Promise((r) => setTimeout(r, 10));

    const send = (s: string): void => listeners.forEach((fn) => fn(s));
    send(' '); // toggle a
    send('\x1b[B'); // down
    send(' '); // toggle b
    send('\r'); // submit

    const indices = await pending;
    expect(indices).toEqual([0, 1]);
    const frames = written.join('');
    expect(frames).toContain('[x] a');
    expect(frames).toContain('❯ ');
    // Raw mode was entered and released.
    expect(rawMode).toBe(false);
  });
});
