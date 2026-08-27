import type { KeyEvent } from '@mudah-cli/terminal';

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
}
