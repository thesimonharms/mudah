import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { clipPad, Layout } from './layout.js';
import type { Component } from './component.js';
import { List, Panel } from './widgets.js';

export interface PaletteItem {
  id: string;
  label: string;
}

/**
 * Wraps a base layout with a modal, toasts, and a `ctrl+k` command palette.
 * Escape closes the overlay and does not quit the Program while one is open.
 */
export class Overlay extends Layout {
  private modal: Component | undefined;
  private palette: List | undefined;
  private toasts: { text: string; until: number }[] = [];
  private onPalettePick: ((id: string) => void) | undefined;
  private paletteItems: PaletteItem[] = [];

  constructor(private readonly base: Layout) {
    super();
    this.children = [base];
  }

  openModal(title: string, body: string[]): void {
    this.modal = new Panel(title, body);
  }

  closeModal(): void {
    this.modal = undefined;
  }

  toast(text: string, ms = 3000): void {
    this.toasts.push({ text, until: Date.now() + ms });
  }

  /** Register palette items without opening. `ctrl+k` opens them. */
  setPalette(items: PaletteItem[], onPick: (id: string) => void): void {
    this.paletteItems = items;
    this.onPalettePick = onPick;
  }

  openPalette(items: PaletteItem[], onPick: (id: string) => void): void {
    this.setPalette(items, onPick);
    this.palette = new List(
      items.map((item) => item.label),
      (index) => {
        const id = items[index]?.id;
        this.palette = undefined;
        if (id !== undefined) onPick(id);
      },
    );
  }

  closePalette(): void {
    this.palette = undefined;
  }

  override handleKey(event: KeyEvent): boolean {
    if (event.kind === 'release') return false;
    if (event.name === 'ctrl+k') {
      if (this.palette) {
        this.closePalette();
        return true;
      }
      if (this.paletteItems.length > 0 && this.onPalettePick) {
        this.openPalette(this.paletteItems, this.onPalettePick);
        return true;
      }
      return true;
    }
    if (this.palette) {
      if (event.name === 'escape') {
        this.closePalette();
        return true;
      }
      return this.palette.onKey(event);
    }
    if (this.modal) {
      if (event.name === 'escape') {
        this.closeModal();
        return true;
      }
      return this.modal.onKey?.(event) ?? true;
    }
    return this.base.handleKey(event);
  }

  override handleMouse(event: MouseEvent): boolean {
    if (this.palette) return this.palette.onMouse?.(event) ?? false;
    if (this.modal) return this.modal.onMouse?.(event) ?? false;
    return this.base.handleMouse(event);
  }

  protected measureAlong(width: number, height: number): { width: number; height: number } {
    return this.base.measure(width, height);
  }

  protected place(width: number, height: number | undefined): void {
    const h = height ?? 1;
    this.bounds = [{ child: this.base, x: 0, y: 0, width, height: h }];
    this.base.resize(width, h);
  }

  override render(): string[] {
    this.layout();
    const lines = this.composite();
    const w = this.box?.width ?? 80;
    const h = this.box?.height ?? lines.length;
    const grid = lines.map((line) => clipPad(line, w).split(''));
    while (grid.length < h) grid.push(Array.from({ length: w }, () => ' '));

    this.toasts = this.toasts.filter((t) => t.until > Date.now());
    if (this.toasts.length > 0) {
      const text = this.toasts[this.toasts.length - 1]!.text;
      const y = Math.max(0, h - 1);
      const row = grid[y];
      if (row) {
        const padded = clipPad(text, w);
        for (let x = 0; x < w; x++) row[x] = padded[x] ?? ' ';
      }
    }

    const overlay = this.palette ?? this.modal;
    if (overlay) {
      const block = overlay.render();
      const top = Math.max(0, Math.floor((h - block.length) / 2));
      const left = Math.max(0, Math.floor((w - Math.max(0, ...block.map((l) => l.length))) / 2));
      block.forEach((line, i) => {
        const row = grid[top + i];
        if (!row) return;
        for (let x = 0; x < line.length && left + x < w; x++) {
          row[left + x] = line[x] ?? ' ';
        }
      });
    }

    return grid.map((row) => row.join('').replace(/\s+$/, ''));
  }

  inspect(): { role: string } {
    return { role: 'overlay' };
  }
}
