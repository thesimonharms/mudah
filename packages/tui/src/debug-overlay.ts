import { dumpTree, type TreeNode } from './dump.js';
import type { Layout } from './layout.js';
import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

/**
 * Layout debugger: live `dumpTree` plus a grid overlay of child boxes.
 * Characters are ASCII (`+` edges, `#` fill, `.` empty) — no raw ANSI.
 */
export class LayoutDebugger extends BaseComponent {
  readonly focusable = true;
  readonly keys = { tab: 'next box' };
  private selected = 0;

  constructor(
    private readonly root: Layout,
    private readonly cols = 40,
    private readonly rows = 12,
  ) {
    super();
  }

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
    const boxes = this.root.childBounds;
    for (const [i, box] of boxes.entries()) {
      const x1 = Math.max(0, box.x);
      const y1 = Math.max(0, box.y);
      const x2 = Math.min(this.cols, box.x + box.width);
      const y2 = Math.min(this.rows, box.y + box.height);
      const edgeChar = i === this.selected ? '*' : '+';
      for (let y = y1; y < y2; y++) {
        const row = grid[y];
        if (row === undefined) continue;
        for (let x = x1; x < x2; x++) {
          const edge = y === y1 || y === y2 - 1 || x === x1 || x === x2 - 1;
          row[x] = edge ? edgeChar : i === this.selected ? '#' : ':';
        }
      }
    }
    return grid.map((row) => row.join('')).join('\n');
  }

  /** One line per child: role, x, y, width, height. */
  legend(): string[] {
    this.root.resize(this.cols, this.rows);
    this.root.render();
    const tree = dumpTree(this.root);
    const children = tree.children ?? [];
    return this.root.childBounds.map((box, i) => {
      const role = children[i]?.role ?? `child${i}`;
      const mark = i === this.selected ? '▸' : ' ';
      return `${mark}${i} ${role}  ${box.x},${box.y}  ${box.width}x${box.height}`;
    });
  }

  render(): string[] {
    const header = `layout debugger  ${this.cols}x${this.rows}`;
    return [header, this.overlay(), ...this.legend()];
  }

  override onKey(event: KeyEvent): boolean {
    const count = this.root.childBounds.length;
    if (count === 0) return false;
    if (event.name === 'tab' || event.name === 'right' || event.name === 'down') {
      this.selected = (this.selected + 1) % count;
      return true;
    }
    if (event.name === 'left' || event.name === 'up') {
      this.selected = (this.selected - 1 + count) % count;
      return true;
    }
    return false;
  }

  inspect() {
    return { role: 'layout-debugger', value: { selected: this.selected, boxes: this.root.childBounds.length } };
  }
}
