import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { blitLines, dumpTree, ScreenBuffer, type Layout, type TreeNode } from '@mudah-cli/tui';
import { paint, sleekDark, type Theme } from '@mudah-cli/ui';
import { diffSnapshots } from './visual-diff.js';
import { assertHasColor, type ColorExpectation } from './snapshot-assert.js';

export interface TestTuiOptions {
  cols?: number;
  rows?: number;
  /** Directory for snapshot files. Default: `test/fixtures` relative to CWD. */
  snapshotDir?: string;
}

export type TestTuiAction =
  | { kind: 'send'; name: string; ch?: string }
  | { kind: 'paste'; text: string }
  | { kind: 'click'; x: number; y: number }
  | { kind: 'wheel'; direction: 'up' | 'down' }
  | { kind: 'resize'; cols: number; rows: number };

export interface TestTuiMeasure {
  /** Wall time of the last `send`/`paste`/`click`/`wheel`/`resize` apply. */
  sendMs: number;
  /** Wall time of the snapshot render after that action. */
  renderMs: number;
  /** Number of recorded actions on the current history stack. */
  actions: number;
}

/**
 * Headless TUI harness. No PTY. Mount a layout, inject keys and clicks,
 * read an ASCII frame or a JSON tree.
 *
 * ```ts
 * const tui = TestTui.mount(screen.root, { cols: 80, rows: 24 });
 * tui.send('down').send('enter');
 * expect(tui.snapshot()).toContain('▸');
 * expect(tui.tree().role).toBe('Column');
 * tui.matchSnapshot('picker-01', 'happy path');
 * ```
 */
export class TestTui {
  readonly root: Layout;
  cols: number;
  rows: number;
  private readonly snapshotDir: string;
  private readonly actions: TestTuiAction[] = [];
  /** `snapshot()` after mount, then after each action. */
  private readonly frames: string[] = [];
  private historyIndex = 0;
  private replayFrame: string | null = null;
  private lastSendMs = 0;
  private lastRenderMs = 0;

  private constructor(root: Layout, cols: number, rows: number, snapshotDir: string) {
    this.root = root;
    this.cols = cols;
    this.rows = rows;
    this.snapshotDir = snapshotDir;
    this.root.resize(cols, rows);
    this.frames.push(this.liveSnapshot());
  }

  static mount(root: Layout, options: TestTuiOptions = {}): TestTui {
    return new TestTui(
      root,
      options.cols ?? 80,
      options.rows ?? 24,
      options.snapshotDir ?? join(process.cwd(), 'test', 'fixtures'),
    );
  }

  send(name: string, ch?: string): this {
    const event: KeyEvent = { name, ch: ch ?? (name.length === 1 ? name : undefined) };
    return this.record({ kind: 'send', name, ...(event.ch !== undefined ? { ch: event.ch } : {}) }, () => {
      this.root.handleKey(event);
    });
  }

  paste(text: string): this {
    return this.record({ kind: 'paste', text }, () => {
      this.root.handleKey({ name: 'paste', paste: text });
    });
  }

  click(x: number, y: number): this {
    return this.record({ kind: 'click', x, y }, () => {
      this.root.handleMouse(click(x, y));
    });
  }

  wheel(direction: 'up' | 'down'): this {
    return this.record({ kind: 'wheel', direction }, () => {
      this.root.handleMouse({
        ...click(0, 0),
        buttons: { left: false, middle: false, right: false, extra: false },
        wheel: direction,
      });
    });
  }

  resize(cols: number, rows: number): this {
    return this.record({ kind: 'resize', cols, rows }, () => {
      this.cols = cols;
      this.rows = rows;
      this.root.resize(cols, rows);
    });
  }

  /**
   * Step back one recorded visual frame. `snapshot()` / `frame()` then
   * return the stored frame. A later mutating call truncates the redo stack.
   */
  undo(): this {
    if (this.historyIndex <= 0) return this;
    this.historyIndex -= 1;
    this.replayFrame = this.frames[this.historyIndex] ?? null;
    return this;
  }

  /** Step forward one recorded visual frame after {@link undo}. */
  redo(): this {
    if (this.historyIndex >= this.frames.length - 1) {
      this.replayFrame = null;
      return this;
    }
    this.historyIndex += 1;
    this.replayFrame =
      this.historyIndex >= this.frames.length - 1 ? null : (this.frames[this.historyIndex] ?? null);
    return this;
  }

  /** Recorded actions on the current (possibly truncated) stack. */
  history(): readonly TestTuiAction[] {
    return this.actions.slice();
  }

  /** Timing of the last recorded action. */
  measure(): TestTuiMeasure {
    return {
      sendMs: this.lastSendMs,
      renderMs: this.lastRenderMs,
      actions: this.actions.length,
    };
  }

  /** Throw if the last action's send+render exceeded `budgetMs`. */
  expectFast(budgetMs: number): this {
    const took = this.lastSendMs + this.lastRenderMs;
    if (took > budgetMs) {
      throw new Error(
        `[test-tui] Expected last action to finish within ${String(budgetMs)}ms, took ${took.toFixed(2)}ms` +
          ` (send ${this.lastSendMs.toFixed(2)}ms + render ${this.lastRenderMs.toFixed(2)}ms)`,
      );
    }
    return this;
  }

  frame(): string[] {
    if (this.replayFrame !== null) {
      const lines = this.replayFrame.split('\n');
      const out = lines.slice(0, this.rows);
      while (out.length < this.rows) out.push('');
      return out;
    }
    return this.liveFrame();
  }

  snapshot(options?: { color?: boolean }): string {
    if (options?.color === true) return this.colorSnapshot();
    if (this.replayFrame !== null) return this.replayFrame;
    return this.liveSnapshot();
  }

  /** Assert a fragment in the color snapshot is painted with `hex`. */
  toHaveColor(expectation: ColorExpectation, theme: Theme = sleekDark): this {
    assertHasColor(this.colorSnapshot(theme), expectation);
    return this;
  }

  /** Alias of {@link expectFast}. */
  toBeFast(budgetMs: number): this {
    return this.expectFast(budgetMs);
  }

  tree(): TreeNode {
    this.root.resize(this.cols, this.rows);
    return dumpTree(this.root);
  }

  /**
   * Assert that the current snapshot matches a stored baseline file.
   * When `UPDATE_SNAPSHOT=1` is in the environment, writes the file instead.
   */
  matchSnapshot(name: string, description?: string): void {
    const snapshotPath = join(this.snapshotDir, `${name}.snapshot`);
    const current = this.snapshot();

    if (process.env['UPDATE_SNAPSHOT'] === '1' || process.argv.includes('--update')) {
      mkdirSync(dirname(snapshotPath), { recursive: true });
      writeFileSync(snapshotPath, current, 'utf8');
      return;
    }

    let baseline: string;
    try {
      baseline = readFileSync(snapshotPath, 'utf8');
    } catch {
      throw new Error(
        `[test-tui] Snapshot file not found: ${snapshotPath}\n` +
          `Run with UPDATE_SNAPSHOT=1 to create it.\n` +
          (description ? `Description: ${description}\n` : '') +
          `Snapshot content:\n---\n${current}\n---`,
      );
    }

    if (current !== baseline) {
      const diff = diffSnapshots(baseline, current);
      throw new Error(
        `[test-tui] Snapshot mismatch: ${name}` +
          (description ? ` (${description})` : '') +
          '\n--- expected ---\n' +
          baseline +
          '\n--- actual ---\n' +
          current +
          (diff === '' ? '' : `\n--- diff ---\n${diff}`),
      );
    }
  }

  private record(action: TestTuiAction, apply: () => void): this {
    if (this.historyIndex < this.frames.length - 1) {
      this.frames.length = this.historyIndex + 1;
      this.actions.length = this.historyIndex;
    }
    this.replayFrame = null;

    const t0 = performance.now();
    apply();
    const t1 = performance.now();
    const frame = this.liveSnapshot();
    const t2 = performance.now();

    this.lastSendMs = t1 - t0;
    this.lastRenderMs = t2 - t1;
    this.actions.push(action);
    this.frames.push(frame);
    this.historyIndex = this.frames.length - 1;
    return this;
  }

  private liveFrame(): string[] {
    this.root.resize(this.cols, this.rows);
    const lines = this.root.render();
    const out = lines.slice(0, this.rows);
    while (out.length < this.rows) out.push('');
    return out;
  }

  private liveSnapshot(): string {
    return this.liveFrame().join('\n').replace(/[ \t]+\n/g, '\n').trimEnd();
  }

  private colorSnapshot(theme: Theme = sleekDark): string {
    this.root.resize(this.cols, this.rows);
    const buffer = new ScreenBuffer(this.cols, this.rows);
    blitLines(buffer, this.root.render());
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      let line = '';
      let run = '';
      let style = '';
      const flush = (): void => {
        if (run.length === 0) return;
        const hex = style === '' ? undefined : theme.colors[style as keyof Theme['colors']];
        line += hex ? paint(hex, run, 24) : run;
        run = '';
      };
      for (let x = 0; x < this.cols; x++) {
        const cell = buffer.getCell(x, y);
        if (cell.char === '') continue;
        if (cell.style !== style) {
          flush();
          style = cell.style;
        }
        run += cell.char;
      }
      flush();
      lines.push(line);
    }
    return lines.join('\n').replace(/[ \t]+\n/g, '\n').trimEnd();
  }
}

/** Named helper matching the ROADMAP `toBeFast` assertion. */
export function assertFast(tui: TestTui, budgetMs: number): void {
  tui.expectFast(budgetMs);
}

function click(x: number, y: number): MouseEvent {
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
  };
}
