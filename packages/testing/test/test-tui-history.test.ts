import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFast, TestTui } from '@mudah-cli/testing';
import { Column, Label, List } from '@mudah-cli/tui';

const fixtureDir = join(fileURLToPath(new URL('.', import.meta.url)), '.fixtures', 'history');

afterEach(() => {
  delete process.env['UPDATE_SNAPSHOT'];
  rmSync(fixtureDir, { recursive: true, force: true });
});

function picker(): TestTui {
  return TestTui.mount(new Column().add(new List(['alpha', 'beta', 'gamma'])), {
    cols: 20,
    rows: 6,
  });
}

describe('TestTui time-travel', () => {
  it('records actions and exposes them via history()', () => {
    const tui = picker();
    expect(tui.history()).toEqual([]);
    tui.send('down').paste('x').click(1, 2).wheel('down').resize(12, 4);
    expect(tui.history()).toEqual([
      { kind: 'send', name: 'down' },
      { kind: 'paste', text: 'x' },
      { kind: 'click', x: 1, y: 2 },
      { kind: 'wheel', direction: 'down' },
      { kind: 'resize', cols: 12, rows: 4 },
    ]);
  });

  it('undo() and redo() step through stored snapshot frames', () => {
    const tui = picker();
    const initial = tui.snapshot();
    expect(initial).toContain('▸ alpha');

    tui.send('down');
    const afterDown = tui.snapshot();
    expect(afterDown).toContain('▸ beta');
    expect(afterDown).not.toBe(initial);

    tui.undo();
    expect(tui.snapshot()).toBe(initial);
    expect(tui.frame().join('\n')).toContain('▸ alpha');

    tui.redo();
    expect(tui.snapshot()).toBe(afterDown);
    expect(tui.snapshot()).toContain('▸ beta');
  });

  it('undo() at the start and redo() at the head are no-ops', () => {
    const tui = picker();
    const initial = tui.snapshot();
    tui.undo().undo();
    expect(tui.snapshot()).toBe(initial);
    tui.send('down');
    const after = tui.snapshot();
    tui.redo().redo();
    expect(tui.snapshot()).toBe(after);
  });

  it('a new send() after undo() truncates the redo stack', () => {
    const tui = picker();
    tui.send('down').send('down');
    expect(tui.snapshot()).toContain('▸ gamma');
    tui.undo();
    expect(tui.snapshot()).toContain('▸ beta');
    expect(tui.history()).toHaveLength(2);

    tui.send('up');
    expect(tui.history()).toEqual([
      { kind: 'send', name: 'down' },
      { kind: 'send', name: 'up' },
    ]);
    tui.redo();
    expect(tui.history()).toHaveLength(2);
  });
});

describe('TestTui.measure / expectFast', () => {
  it('returns sendMs, renderMs, and the action count', () => {
    const tui = picker();
    const empty = tui.measure();
    expect(empty).toEqual({ sendMs: 0, renderMs: 0, actions: 0 });

    tui.send('down').send('up');
    const measured = tui.measure();
    expect(measured.actions).toBe(2);
    expect(measured.sendMs).toBeGreaterThanOrEqual(0);
    expect(measured.renderMs).toBeGreaterThanOrEqual(0);
    expect(typeof measured.sendMs).toBe('number');
    expect(typeof measured.renderMs).toBe('number');
  });

  it('expectFast and assertFast pass for a generous budget', () => {
    const tui = picker();
    tui.send('down');
    expect(() => tui.expectFast(10_000)).not.toThrow();
    expect(tui.expectFast(10_000)).toBe(tui);
    expect(() => assertFast(tui, 10_000)).not.toThrow();
  });

  it('expectFast throws when the budget is exceeded', () => {
    const tui = picker();
    tui.send('down');
    expect(() => tui.expectFast(-1)).toThrow(/Expected last action to finish within -1ms/);
  });
});

describe('TestTui.matchSnapshot visual diff', () => {
  it('keeps the existing mismatch prefix and appends a char-level diff', () => {
    mkdirSync(fixtureDir, { recursive: true });
    const writer = TestTui.mount(new Column().add(new Label('hello world')), {
      cols: 20,
      rows: 3,
      snapshotDir: fixtureDir,
    });
    process.env['UPDATE_SNAPSHOT'] = '1';
    writer.matchSnapshot('visual-diff', 'caption');
    delete process.env['UPDATE_SNAPSHOT'];

    const reader = TestTui.mount(new Column().add(new Label('hello earth')), {
      cols: 20,
      rows: 3,
      snapshotDir: fixtureDir,
    });
    expect(() => reader.matchSnapshot('visual-diff', 'caption')).toThrow(
      /\[test-tui\] Snapshot mismatch: visual-diff \(caption\)\n--- expected ---\n/,
    );
    try {
      reader.matchSnapshot('visual-diff', 'caption');
      expect.unreachable('should throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('--- actual ---');
      expect(message).toContain('--- diff ---');
      expect(message).toContain('-');
      expect(message).toContain('+');
      expect(message).toContain('hello');
    }
  });
});
