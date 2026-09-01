import { dumpTree, type TreeNode } from './dump.js';
import type { Layout } from './layout.js';

/**
 * Layout debugger: live `dumpTree` plus a grid overlay of child boxes.
 * Characters are ASCII (`+` edges, `#` fill, `.` empty) — no raw ANSI.
 */
export class LayoutDebugger {
  constructor(
    private readonly root: Layout,
    private readonly cols = 40,
    private readonly rows = 12,
  ) {}

  tree(): TreeNode {
    this.root.resize(this.cols, this.rows);
    return dumpTree(this.root);
  }

  /** Plain-text grid showing each child's allocated box. */
  overlay(): string {
    this.root.resize(this.cols, this.rows);
    this.root.render();
    const grid: string[][] = Array.from({ length: this.rows }, () =>
      Array.from({ length: this.cols }, () => '.'),
    );
    for (const box of this.root.childBounds) {
      const x1 = Math.max(0, box.x);
      const y1 = Math.max(0, box.y);
      const x2 = Math.min(this.cols, box.x + box.width);
      const y2 = Math.min(this.rows, box.y + box.height);
      for (let y = y1; y < y2; y++) {
        const row = grid[y];
        if (row === undefined) continue;
        for (let x = x1; x < x2; x++) {
          const edge = y === y1 || y === y2 - 1 || x === x1 || x === x2 - 1;
          row[x] = edge ? '+' : '#';
        }
      }
    }
    return grid.map((row) => row.join('')).join('\n');
  }
}
