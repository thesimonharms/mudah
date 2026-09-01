import { describe, expect, it } from 'vitest';
import { Pager } from '@mudah-cli/tui';
import { TestTui } from '@mudah-cli/testing';

describe('Pager', () => {
  const lines = Array.from({ length: 40 }, (_, i) => (i === 25 ? 'foo match' : `line ${i}`));

  it('snapshot contains the title', () => {
    const pager = new Pager({ lines, title: 'Log' });
    const tui = TestTui.mount(pager, { cols: 40, rows: 8 });
    expect(tui.snapshot()).toContain('Log');
    expect(tui.tree().role).toBe('pager');
  });

  it('search finds a line and marks the match', () => {
    const pager = new Pager({ lines, title: 'Log' });
    const tui = TestTui.mount(pager, { cols: 40, rows: 8 });
    expect(tui.snapshot()).not.toContain('foo match');
    tui.send('/').send('f').send('o').send('o').send('enter');
    expect(tui.snapshot()).toContain('foo match');
    expect(tui.snapshot()).toContain('▸');
    expect(tui.tree().role).toBe('pager');
    expect(tui.tree().value).toEqual({ offset: expect.any(Number), query: 'foo' });
  });

  it('jumps with g/G and pages without quitting on q', () => {
    const pager = new Pager({ lines, title: 'Log' });
    const tui = TestTui.mount(pager, { cols: 40, rows: 8 });
    tui.send('G');
    expect(tui.snapshot()).toContain('line 39');
    tui.send('g');
    expect(tui.snapshot()).toContain('line 0');
    expect(tui.snapshot()).not.toContain('line 39');
    expect(pager.onKey({ name: 'q' })).toBe(false);
  });
});
