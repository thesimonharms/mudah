import type { KeyEvent } from '@mudah-cli/terminal';
import type { Component } from './component.js';
import { Column } from './layout.js';

export interface PagerOptions {
  lines: string[];
  title?: string;
}

/**
 * Less-like viewport: scroll, jump, and incremental search. `q` is not a
 * quit key (returns false so Program can ignore it). Escape is also left
 * unhandled so Program can quit.
 */
export class Pager extends Column {
  override readonly focusable = true;
  readonly keys = {
    up: 'up',
    down: 'down',
    'page-up': 'page',
    'page-down': 'page',
    g: 'top',
    G: 'bottom',
    '/': 'search',
    n: 'next',
    N: 'prev',
  };

  private readonly title?: string;
  private readonly lines: string[];
  /** First visible content row. */
  private offset = 0;
  private allocatedHeight?: number;
  private query = '';
  private searching = false;
  /** Index of the current match in `lines`, or -1. */
  private matchIndex = -1;

  constructor(options: PagerOptions) {
    super();
    this.lines = options.lines;
    this.title = options.title;
  }

  override focusables(): Component[] {
    return [this];
  }

  override handleKey(event: KeyEvent): boolean {
    if (event.kind === 'release') return false;
    return this.onKey(event);
  }

  override resize(width: number, height: number): void {
    super.resize(width, height);
    this.allocatedHeight = height;
    this.clampOffset();
  }

  private get windowHeight(): number {
    return this.allocatedHeight ?? this.box?.height ?? Math.max(this.lines.length + this.chrome, 1);
  }

  /** Rows reserved for title + search prompt. */
  private get chrome(): number {
    return (this.title ? 1 : 0) + (this.searching ? 1 : 0);
  }

  private get bodyRows(): number {
    return Math.max(1, this.windowHeight - this.chrome);
  }

  private get maxOffset(): number {
    return Math.max(0, this.lines.length - this.bodyRows);
  }

  private clampOffset(): void {
    this.offset = Math.min(Math.max(this.offset, 0), this.maxOffset);
  }

  private jump(offset: number): void {
    this.offset = offset;
    this.clampOffset();
  }

  private scrollBy(delta: number): void {
    this.jump(this.offset + delta);
  }

  private reveal(index: number): void {
    if (index < this.offset) this.offset = index;
    else if (index >= this.offset + this.bodyRows) this.offset = index - this.bodyRows + 1;
    this.clampOffset();
  }

  private matches(): number[] {
    if (this.query.length === 0) return [];
    const q = this.query.toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < this.lines.length; i++) {
      if (this.lines[i]!.toLowerCase().includes(q)) out.push(i);
    }
    return out;
  }

  private findFrom(start: number, direction: 1 | -1): void {
    const hits = this.matches();
    if (hits.length === 0) {
      this.matchIndex = -1;
      return;
    }
    if (direction === 1) {
      const next = hits.find((i) => i >= start) ?? hits[0]!;
      this.matchIndex = next;
    } else {
      let prev = hits[hits.length - 1]!;
      for (const i of hits) {
        if (i <= start) prev = i;
        else break;
      }
      this.matchIndex = prev;
    }
    this.reveal(this.matchIndex);
  }

  override onKey(event: KeyEvent): boolean {
    if (this.searching) {
      if (event.name === 'enter') {
        this.searching = false;
        this.findFrom(0, 1);
        return true;
      }
      if (event.name === 'escape') {
        this.searching = false;
        this.query = '';
        this.matchIndex = -1;
        return true;
      }
      if (event.name === 'backspace') {
        this.query = this.query.slice(0, -1);
        return true;
      }
      const ch = event.ch ?? (event.name.length === 1 ? event.name : undefined);
      if (ch !== undefined && ch >= ' ') {
        this.query += ch;
        return true;
      }
      return true;
    }

    switch (event.name) {
      case 'up':
        this.scrollBy(-1);
        return true;
      case 'down':
        this.scrollBy(1);
        return true;
      case 'page-up':
        this.scrollBy(-this.bodyRows);
        return true;
      case 'page-down':
        this.scrollBy(this.bodyRows);
        return true;
      case 'home':
      case 'g':
        this.jump(0);
        return true;
      case 'end':
      case 'G':
        this.jump(this.maxOffset);
        return true;
      case '/':
        this.searching = true;
        this.query = '';
        this.matchIndex = -1;
        return true;
      case 'n':
        if (this.query.length > 0) this.findFrom(this.matchIndex + 1, 1);
        return true;
      case 'N':
        if (this.query.length > 0) this.findFrom(this.matchIndex - 1, -1);
        return true;
      case 'q':
        return false;
      default: {
        const ch = event.ch ?? (event.name.length === 1 ? event.name : undefined);
        if (ch === 'g') {
          this.jump(0);
          return true;
        }
        if (ch === 'G') {
          this.jump(this.maxOffset);
          return true;
        }
        if (ch === 'n' && this.query.length > 0) {
          this.findFrom(this.matchIndex + 1, 1);
          return true;
        }
        if (ch === 'N' && this.query.length > 0) {
          this.findFrom(this.matchIndex - 1, -1);
          return true;
        }
        if (ch === '/') {
          this.searching = true;
          this.query = '';
          this.matchIndex = -1;
          return true;
        }
        return false;
      }
    }
  }

  override render(): string[] {
    this.clampOffset();
    const out: string[] = [];
    if (this.title) out.push(this.title);
    const end = this.offset + this.bodyRows;
    for (let i = this.offset; i < end; i++) {
      const line = this.lines[i];
      if (line === undefined) {
        out.push('');
        continue;
      }
      const mark = i === this.matchIndex ? '▸ ' : '  ';
      out.push(`${mark}${line}`);
    }
    if (this.searching) out.push(`/${this.query}`);
    const target = this.windowHeight;
    if (out.length > target) return out.slice(0, target);
    while (out.length < target) out.push('');
    return out;
  }

  override inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'pager', name: this.title, value: { offset: this.offset, query: this.query } };
  }
}
