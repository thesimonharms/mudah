import { visibleLength } from '@mudah-cli/ui';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { BaseComponent, type Component } from './component.js';

/** Child box in the parent's coordinate space. */
export interface ChildBounds {
  readonly child: Component;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const UNBOUNDED = 65535;

function measureChild(child: Component, width: number, height: number): { width: number; height: number } {
  if (child.measure) return child.measure(width, height);
  const lines = child.render();
  const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
  return { width: Math.min(width, Math.max(content, 0)), height: lines.length };
}

function isStretch(child: Component): boolean {
  return typeof child.resize === 'function';
}

/** Clip or pad a row to `width` visible cells. */
export function clipPad(text: string, width: number): string {
  if (width <= 0) return '';
  const vis = visibleLength(text);
  if (vis === width) return text;
  if (vis < width) return text + ' '.repeat(width - vis);
  let out = '';
  let used = 0;
  for (const char of text) {
    const w = visibleLength(char);
    if (used + w > width) break;
    out += char;
    used += w;
  }
  if (used < width) out += ' '.repeat(width - used);
  return out;
}

function distribute(extra: number, sizes: number[], stretchAt: number[]): void {
  if (stretchAt.length === 0) return;
  if (extra >= 0) {
    const base = Math.floor(extra / stretchAt.length);
    let rem = extra % stretchAt.length;
    for (const i of stretchAt) {
      sizes[i] = (sizes[i] ?? 0) + base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
    }
    return;
  }
  let need = -extra;
  for (const i of stretchAt) {
    const current = sizes[i] ?? 0;
    const take = Math.min(Math.max(current - 1, 0), need);
    sizes[i] = current - take;
    need -= take;
    if (need === 0) return;
  }
}

/**
 * Shared layout container: children, Tab focus over nested leaves, 2D mouse
 * hit-testing, and compositing. {@link Column}, {@link Row}, and {@link Split}
 * only differ in how they place children.
 */
export abstract class Layout extends BaseComponent {
  protected children: Component[] = [];
  protected box: { width: number; height: number } | undefined;
  protected bounds: ChildBounds[] = [];
  private focusIndex = -1;

  readonly focusable = false;

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: this.constructor.name };
  }

  add(...components: Component[]): this {
    this.children.push(...components);
    if (this.focusIndex === -1) this.focusFirst();
    return this;
  }

  get components(): readonly Component[] {
    return this.children;
  }

  /** Boxes from the last layout pass. Used by `dumpTree` and overlays. */
  get childBounds(): readonly ChildBounds[] {
    return this.bounds;
  }

  get focused(): Component | undefined {
    return this.focusables()[this.focusIndex];
  }

  /** Leaves that take focus, in tree order. Nested layouts are transparent. */
  focusables(): Component[] {
    const out: Component[] = [];
    for (const child of this.children) {
      if (child instanceof Layout) out.push(...child.focusables());
      else if (child.focusable) out.push(child);
    }
    return out;
  }

  private focusFirst(): void {
    const leaves = this.focusables();
    this.setFocus(leaves.length > 0 ? 0 : -1);
  }

  /** Recompute the focused leaf after the child list changes. */
  protected refocus(): void {
    this.focusIndex = -1;
    this.focusFirst();
  }

  private setFocus(index: number): void {
    const leaves = this.focusables();
    const previous = leaves[this.focusIndex];
    previous?.onBlur?.();
    this.focusIndex = index;
    if (index >= 0) leaves[index]?.onFocus?.();
  }

  cycle(direction: 1 | -1): void {
    const leaves = this.focusables();
    const count = leaves.length;
    if (count === 0) return;
    const current = this.focusIndex < 0 ? 0 : this.focusIndex;
    for (let step = 1; step <= count; step++) {
      const candidate = (current + direction * step + count * 2) % count;
      if (leaves[candidate]) {
        this.setFocus(candidate);
        return;
      }
    }
  }

  /** Route a key: focused leaf first, then Tab cycles leaves. True if consumed. */
  handleKey(event: KeyEvent): boolean {
    if (event.kind === 'release') return false;
    if (this.focused?.onKey?.(event)) return true;
    if (event.name === 'tab' || event.name === 'shift-tab') {
      this.cycle(event.name === 'tab' ? 1 : -1);
      return true;
    }
    return false;
  }

  /**
   * Route a mouse event to the child whose box contains the point.
   * Coordinates are translated into the child's own space.
   */
  handleMouse(event: MouseEvent): boolean {
    this.layout();
    if (this.draggingCapture(event)) return true;
    for (const b of this.bounds) {
      if (event.x >= b.x && event.x < b.x + b.width && event.y >= b.y && event.y < b.y + b.height) {
        return (
          b.child.onMouse?.({
            ...event,
            x: event.x - b.x,
            y: event.y - b.y,
          }) ?? false
        );
      }
    }
    return false;
  }

  /** Split overrides this to keep a drag even when the cursor leaves the bar. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected draggingCapture(_event: MouseEvent): boolean {
    return false;
  }

  override onMouse(event: MouseEvent): boolean {
    return this.handleMouse(event);
  }

  /** Kitty graphics and other extras, walked in tree order. */
  paintExtras(stream: { write(data: string): unknown }, x = 0, y = 0): void {
    this.layout();
    for (const b of this.bounds) {
      if (b.child instanceof Layout) b.child.paintExtras(stream, x + b.x, y + b.y);
      else b.child.paintExtras?.(stream, x + b.x, y + b.y);
    }
  }

  resize(width: number, height: number): void {
    this.box = { width, height };
  }

  override get height(): number {
    if (this.box) return this.box.height;
    if (this.bounds.length > 0) {
      return this.bounds.reduce((max, b) => Math.max(max, b.y + b.height), 0);
    }
    return this.children.reduce((sum, c) => sum + (c.height ?? c.render().length), 0);
  }

  measure(width: number, height: number): { width: number; height: number } {
    return this.measureAlong(width, height);
  }

  render(): string[] {
    this.layout();
    return this.composite();
  }

  protected layout(): void {
    const width = this.box?.width ?? this.intrinsicWidth();
    const height = this.box?.height;
    this.place(width, height);
  }

  protected abstract measureAlong(width: number, height: number): { width: number; height: number };
  protected abstract place(width: number, height: number | undefined): void;

  protected intrinsicWidth(): number {
    if (this.children.length === 0) return 0;
    let max = 0;
    for (const child of this.children) {
      const w = measureChild(child, UNBOUNDED, UNBOUNDED).width;
      if (w < UNBOUNDED) max = Math.max(max, w);
    }
    return Math.max(max, 1);
  }

  protected composite(): string[] {
    const width = this.box?.width ?? this.bounds.reduce((max, b) => Math.max(max, b.x + b.width), 0);
    const height =
      this.box?.height ?? this.bounds.reduce((max, b) => Math.max(max, b.y + b.height), 0);
    if (width <= 0 || height <= 0) return [];
    const grid: string[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
    for (const b of this.bounds) {
      const rows = b.child.render();
      for (let i = 0; i < b.height; i++) {
        const gy = b.y + i;
        if (gy < 0 || gy >= height) continue;
        const clipped = clipPad(rows[i] ?? '', b.width);
        let gx = b.x;
        for (const char of clipped) {
          if (gx < 0 || gx >= width) break;
          const cell = grid[gy];
          if (cell) cell[gx] = char;
          gx += 1;
        }
      }
    }
    return grid.map((row) => row.join('').replace(/\s+$/, ''));
  }
}

/** Vertical stack. Remaining height goes to children that implement `resize`. */
export class Column extends Layout {
  protected measureAlong(width: number, height: number): { width: number; height: number } {
    let sum = 0;
    let maxW = 0;
    for (const child of this.children) {
      const m = measureChild(child, width, height);
      sum += m.height;
      maxW = Math.max(maxW, m.width);
    }
    return { width: Math.min(width, maxW || width), height: sum };
  }

  protected place(width: number, height: number | undefined): void {
    const measured = this.children.map((c) => measureChild(c, width, height ?? UNBOUNDED));
    const sizes = measured.map((m) => m.height);
    const stretchAt = this.children.map((c, i) => (isStretch(c) ? i : -1)).filter((i) => i >= 0);
    if (height !== undefined) {
      const sum = sizes.reduce((a, b) => a + b, 0);
      distribute(height - sum, sizes, stretchAt);
    }
    let y = 0;
    this.bounds = [];
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i]!;
      const h = Math.max(0, sizes[i] ?? 0);
      this.bounds.push({ child, x: 0, y, width, height: h });
      child.resize?.(width, h);
      y += h;
    }
  }
}

/** Horizontal stack. Remaining width goes to children that implement `resize`. */
export class Row extends Layout {
  protected measureAlong(width: number, height: number): { width: number; height: number } {
    let sum = 0;
    let maxH = 0;
    for (const child of this.children) {
      const m = measureChild(child, width, height);
      sum += m.width;
      maxH = Math.max(maxH, m.height);
    }
    return { width: sum, height: Math.min(height, maxH || height) };
  }

  protected place(width: number, height: number | undefined): void {
    const h = height ?? this.children.reduce((max, c) => Math.max(max, measureChild(c, width, UNBOUNDED).height), 0);
    const measured = this.children.map((c) => measureChild(c, width, h));
    const sizes = measured.map((m) => m.width);
    const stretchAt = this.children.map((c, i) => (isStretch(c) ? i : -1)).filter((i) => i >= 0);
    const sum = sizes.reduce((a, b) => a + b, 0);
    distribute(width - sum, sizes, stretchAt);
    let x = 0;
    this.bounds = [];
    for (let i = 0; i < this.children.length; i++) {
      const child = this.children[i]!;
      const w = Math.max(0, sizes[i] ?? 0);
      this.bounds.push({ child, x, y: 0, width: w, height: h });
      child.resize?.(w, h);
      x += w;
    }
  }
}

/** `Container` is a {@link Column}. Existing `mount(new Container())` stays valid. */
export class Container extends Column {}

export type SplitAxis = 'horizontal' | 'vertical';

export interface SplitOptions {
  /**
   * `horizontal`: left and right panes, bar is `│`.
   * `vertical`: top and bottom panes, bar is `─`.
   * Default `horizontal`.
   */
  axis?: SplitAxis;
  /** First pane as a fraction of the space minus the bar. 0–1, default 0.5. */
  ratio?: number;
}

/**
 * Two panes with a 1-cell drag bar between them. Exactly two children.
 *
 * ```ts
 * new Split({ axis: 'horizontal', ratio: 0.3 }).add(sidebar, main)
 * ```
 */
export class Split extends Layout {
  readonly axis: SplitAxis;
  ratio: number;
  private dragging = false;

  constructor(options: SplitOptions = {}) {
    super();
    this.axis = options.axis ?? 'horizontal';
    this.ratio = clampRatio(options.ratio ?? 0.5);
  }

  protected measureAlong(width: number, height: number): { width: number; height: number } {
    return { width: Math.min(width, 1), height: Math.min(height, 1) };
  }

  protected draggingCapture(event: MouseEvent): boolean {
    if (this.children.length !== 2) return false;
    if (this.dragging) {
      if (event.release || event.buttons.left === false) {
        this.dragging = false;
        return event.release;
      }
      if (event.wheel) return false;
      this.setRatioFromMouse(event);
      this.layout();
      return true;
    }
    if (event.buttons.left && !event.wheel && this.hitBar(event)) {
      this.dragging = true;
      this.setRatioFromMouse(event);
      this.layout();
      return true;
    }
    return false;
  }

  protected place(width: number, height: number | undefined): void {
    if (this.children.length !== 2) {
      throw new Error('[tui] Split requires exactly two children. Use: new Split().add(left, right)');
    }
    const w = width;
    const h = height ?? 1;
    const first = this.children[0]!;
    const second = this.children[1]!;
    this.bounds = [];
    if (this.axis === 'horizontal') {
      const inner = Math.max(w - 1, 0);
      const leftW = clampPane(Math.round(inner * this.ratio), inner);
      const rightW = inner - leftW;
      this.bounds.push({ child: first, x: 0, y: 0, width: leftW, height: h });
      this.bounds.push({ child: second, x: leftW + 1, y: 0, width: rightW, height: h });
      first.resize?.(leftW, h);
      second.resize?.(rightW, h);
    } else {
      const inner = Math.max(h - 1, 0);
      const topH = clampPane(Math.round(inner * this.ratio), inner);
      const bottomH = inner - topH;
      this.bounds.push({ child: first, x: 0, y: 0, width: w, height: topH });
      this.bounds.push({ child: second, x: 0, y: topH + 1, width: w, height: bottomH });
      first.resize?.(w, topH);
      second.resize?.(w, bottomH);
    }
  }

  override render(): string[] {
    this.layout();
    const lines = this.composite();
    const w = this.box?.width ?? this.bounds.reduce((max, b) => Math.max(max, b.x + b.width), 0);
    const h = this.box?.height ?? this.bounds.reduce((max, b) => Math.max(max, b.y + b.height), 0);
    if (this.children.length !== 2 || w <= 0 || h <= 0) return lines;
    // Paint the bar into the gap the place() step left (1 cell between panes).
    const grid = lines.map((line) => clipPad(line, w).split(''));
    if (this.axis === 'horizontal') {
      const barX = this.bounds[0]!.width;
      for (let y = 0; y < h; y++) {
        const row = grid[y];
        if (row && barX >= 0 && barX < w) row[barX] = '│';
      }
    } else {
      const barY = this.bounds[0]!.height;
      const row = grid[barY];
      if (row) {
        for (let x = 0; x < w; x++) row[x] = '─';
      }
    }
    return grid.map((row) => row.join('').replace(/\s+$/, ''));
  }

  private hitBar(event: MouseEvent): boolean {
    if (this.bounds.length < 2) return false;
    if (this.axis === 'horizontal') {
      return event.x === this.bounds[0]!.width && event.y >= 0 && event.y < (this.box?.height ?? 0);
    }
    return event.y === this.bounds[0]!.height && event.x >= 0 && event.x < (this.box?.width ?? 0);
  }

  private setRatioFromMouse(event: MouseEvent): void {
    const w = this.box?.width ?? 1;
    const h = this.box?.height ?? 1;
    if (this.axis === 'horizontal') {
      const inner = Math.max(w - 1, 1);
      this.ratio = clampRatio(event.x / inner);
    } else {
      const inner = Math.max(h - 1, 1);
      this.ratio = clampRatio(event.y / inner);
    }
  }
}

function clampRatio(value: number): number {
  if (Number.isFinite(value) === false) return 0.5;
  return Math.min(Math.max(value, 0), 1);
}

function clampPane(size: number, inner: number): number {
  if (inner <= 1) return inner;
  return Math.min(Math.max(size, 1), inner - 1);
}
