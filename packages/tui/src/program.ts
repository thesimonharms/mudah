import {
  enterRawMode,
  KeyParser,
  parseMouseEvents,
  disableMouse,
  enableMouse,
  enableKittyKeyboard,
  disableKittyKeyboard,
  type KeyEvent,
  type MouseModeOptions,
} from '@mudah-cli/terminal';
import { ScreenBuffer } from './screen-buffer.js';
import { DiffRenderer } from './diff-renderer.js';
import type { Component } from './component.js';
import type { Container } from './widgets.js';

export interface ProgramOptions {
  /** Output stream. Defaults to `process.stdout`. */
  stdout?: { write(data: string): unknown; isTTY?: boolean };
  /** Input stream for key events. Defaults to `process.stdin`. */
  stdin?: NodeJS.ReadStream;
  /** Paint interval in ms. Default 16 (~60fps). */
  frameMs?: number;
  /** Disable the alternate screen buffer (inline rendering). */
  inline?: boolean;
  /**
   * Enable mouse reporting: clicks, drags, and the wheel, routed to the
   * component under the cursor. Default false, since it takes over the
   * terminal's own text selection.
   */
  mouse?: boolean | MouseModeOptions;
  /**
   * Enable the Kitty keyboard protocol (key-up, unambiguous modifiers).
   * Default false. Ghostty, Kitty, and WezTerm honor it; other terminals
   * ignore the enable sequence.
   */
  keyboard?: boolean;
  /** Called for every key event, including repeats and releases. */
  onKey?: (event: KeyEvent) => void;
}

/**
 * A full-screen terminal program: owns the alt-buffer lifecycle, the raw-mode
 * key pump, and scheduled repaints.
 *
 * ```ts
 * const program = new Program();
 * const list = new List(items, () => program.quit());
 * program.mount(new Container().add(list));
 * const code = await program.run(); // resolves on quit()
 * ```
 *
 * Every keystroke is routed to the focused component through
 * `container.handleKey`, then a repaint is requested — the interval paints
 * only when dirty. `esc` quits with 0, `ctrl+c` with 130.
 */
export class Program {
  private readonly stdout: { write(data: string): unknown; isTTY?: boolean };
  private readonly stdin?: NodeJS.ReadStream;
  private readonly frameMs: number;
  private readonly inline: boolean;
  private readonly mouse: MouseModeOptions | false;
  private readonly keyboard: boolean;
  private readonly onKeyHook: ((event: KeyEvent) => void) | undefined;

  private container: Container | undefined;
  private readonly renderer = new DiffRenderer();
  private running = false;
  private dirty = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private parser = new KeyParser();
  private exitRaw: (() => void) | null = null;
  private dataListener: ((chunk: Buffer | string) => void) | null = null;
  private resolveRun: ((code: number) => void) | null = null;

  constructor(options: ProgramOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stdin = options.stdin;
    this.frameMs = options.frameMs ?? 16;
    this.inline = options.inline ?? false;
    this.mouse = options.mouse === true ? {} : options.mouse === undefined ? false : options.mouse;
    this.keyboard = options.keyboard === true;
    this.onKeyHook = options.onKey;
  }

  /** Set (or replace) the component tree. */
  mount(container: Container): void {
    this.container = container;
    this.requestFrame();
  }

  requestFrame(): void {
    this.dirty = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Enter the TUI and run until {@link quit}. Resolves with the exit code
   * passed to `quit()`, disposes the program, and restores the terminal.
   */
  async run(): Promise<number> {
    if (!this.container) throw new Error('[tui] mount() a Container before run().');
    if (this.running) return 0;

    const tty = this.stdin?.isTTY === true && this.stdout.isTTY === true;
    try {
      this.running = true;

      if (!this.inline && tty) {
        // Alt-buffer keeps the user's shell scrollback intact.
        this.stdout.write('\x1b[?1049h\x1b[H');
      }
      if (tty) {
        this.stdout.write('\x1b[?25l'); // hide cursor
        if (this.mouse !== false) this.stdout.write(enableMouse(this.mouse));
        if (this.keyboard) this.stdout.write(enableKittyKeyboard());
        this.exitRaw = enterRawMode(this.stdin!);
        this.dataListener = (chunk): void => {
          for (const event of this.parser.feed(String(chunk))) {
            this.handleKey(event);
          }
          if (this.mouse !== false) this.handleMouse(String(chunk));
        };
        this.stdin!.on('data', this.dataListener);
      }

      const code = await new Promise<number>((resolve) => {
        this.resolveRun = resolve;
        this.timer = setInterval(() => this.tick(), this.frameMs);
        this.paint(); // synchronous first frame so headless tests see output
      });
      return code;
    } finally {
      this.dispose();
    }
  }

  /** Request program end. Idempotent; later calls are ignored. */
  quit(exitCode = 0): void {
    if (!this.running || !this.resolveRun) return;
    const resolve = this.resolveRun;
    this.resolveRun = null;
    resolve(exitCode);
  }

  private tick(): void {
    // Repaint every tick: components may have mutated between frames
    // (timers, async work), and the DiffRenderer makes an unchanged frame
    // cost nothing but a buffer rebuild.
    this.paint();
  }

  private handleKey(event: KeyEvent): void {
    this.onKeyHook?.(event);
    // Releases must not navigate widgets or quit. Games that need key-up
    // listen on `onKey`.
    if (event.kind === 'release') return;
    if (event.name === 'escape' || event.name === 'ctrl+c') {
      this.quit(event.name === 'ctrl+c' ? 130 : 0);
      return;
    }
    this.container?.handleKey(event);
    this.requestFrame();
  }

  /** Route mouse reports to the component under the cursor. */
  private handleMouse(chunk: string): void {
    const events = parseMouseEvents(chunk);
    if (events.length === 0) return;
    for (const event of events) {
      if (this.container?.handleMouse(event)) this.requestFrame();
    }
  }

  private paint(): void {
    if (!this.container) return;
    const width = (this.stdout as { columns?: number }).columns ?? 80;
    const height = (this.stdout as { rows?: number }).rows ?? 24;
    const buffer = new ScreenBuffer(width, height);
    for (const [y, line] of this.container.render().entries()) {
      [...line].forEach((char, x) => buffer.setCell(x, y, char));
    }
    this.renderer.paint(this.stdout, buffer);
  }

  /** Tear down: leave alt-buffer, restore cursor, unhook input. Safe twice. */
  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.dataListener && this.stdin) {
      this.stdin.off('data', this.dataListener);
      this.dataListener = null;
    }
    this.exitRaw?.();
    this.exitRaw = null;
    const tty = this.stdin?.isTTY === true && this.stdout.isTTY === true;
    let out = '';
    if (!this.inline && tty) out += '\x1b[?1049l';
    if (this.mouse !== false && tty) out += disableMouse(this.mouse);
    if (this.keyboard && tty) out += disableKittyKeyboard();
    out += '\x1b[?25h'; // show cursor
    this.stdout.write(out);
    this.running = false;
    this.resolveRun = null;
  }
}
