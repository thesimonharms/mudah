import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dumpTree, type Layout, type TreeNode } from '@mudah-cli/tui';

export interface TestTuiOptions {
  cols?: number;
  rows?: number;
  /** Directory for snapshot files. Default: `test/fixtures` relative to CWD. */
  snapshotDir?: string;
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

  private constructor(root: Layout, cols: number, rows: number, snapshotDir: string) {
    this.root = root;
    this.cols = cols;
    this.rows = rows;
    this.snapshotDir = snapshotDir;
    this.root.resize(cols, rows);
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
    this.root.handleKey(event);
    return this;
  }

  paste(text: string): this {
    this.root.handleKey({ name: 'paste', paste: text });
    return this;
  }

  click(x: number, y: number): this {
    this.root.handleMouse(click(x, y));
    return this;
  }

  wheel(direction: 'up' | 'down'): this {
    this.root.handleMouse({
      ...click(0, 0),
      buttons: { left: false, middle: false, right: false, extra: false },
      wheel: direction,
    });
    return this;
  }

  resize(cols: number, rows: number): this {
    this.cols = cols;
    this.rows = rows;
    this.root.resize(cols, rows);
    return this;
  }

  frame(): string[] {
    this.root.resize(this.cols, this.rows);
    const lines = this.root.render();
    const out = lines.slice(0, this.rows);
    while (out.length < this.rows) out.push('');
    return out;
  }

  snapshot(): string {
    return this.frame().join('\n').replace(/[ \t]+\n/g, '\n').trimEnd();
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

    if (process.env['UPDATE_SNAPSHOT'] === '1') {
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
      throw new Error(
        `[test-tui] Snapshot mismatch: ${name}` +
          (description ? ` (${description})` : '') +
          '\n--- expected ---\n' + baseline + '\n--- actual ---\n' + current,
      );
    }
  }
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
