import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';

/**
 * The TUI component contract. Implement this to add any widget — Mudah's
 * built-ins are just the canonical implementations.
 */
export interface Component {
  /** Drawable rows (plain text; styles are applied by the renderer). */
  render(): string[];
  /** Height in rows the component wants. Default: render().length. */
  height?: number;
  /** Can this component take focus? */
  readonly focusable: boolean;
  /** Called when the component gains focus. */
  onFocus?(): void;
  /** Called when focus moves elsewhere. */
  onBlur?(): void;
  /** Handle a key while focused. Return true to consume it. */
  onKey?(event: KeyEvent): boolean;
  /**
   * Handle a mouse event whose coordinates fall inside the component's box.
   * Return true to consume it. Coordinates are relative to the component's
   * own top-left corner.
   */
  onMouse?(event: MouseEvent): boolean;
  /**
   * Report the size this component wants, given the box available. Used by
   * Row / Column / Split. Return a minimum or preferred size, not a size that
   * a previous `resize()` assigned — otherwise stretch children grow every frame.
   */
  measure?(width: number, height: number): { width: number; height: number };
  /**
   * Assigned box from a parent layout. Presence of `resize` marks a stretch
   * child: leftover Column/Row space goes here.
   */
  resize?(width: number, height: number): void;
  inspect?(): { role: string; name?: string; value?: unknown; href?: string };
  /**
   * Write protocol sequences that cannot live in the cell grid (Kitty
   * graphics). `x`/`y` are the component's top-left on screen.
   */
  paintExtras?(stream: { write(data: string): unknown }, x: number, y: number): void;
  /** Keymap labels for help footers. */
  keys?: Record<string, string>;
}

/** Base implementation with sensible defaults. */
export abstract class BaseComponent implements Component {
  abstract render(): string[];
  abstract readonly focusable: boolean;

  get height(): number {
    return this.render().length;
  }

  onFocus(): void {}
  onBlur(): void {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onKey(_event: KeyEvent): boolean {
    return false;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onMouse(_event: MouseEvent): boolean {
    return false;
  }
}
