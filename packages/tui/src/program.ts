import {
  enterRawMode,
  KeyParser,
  parseMouseEvents,
  disableMouse,
  enableMouse,
  enableKittyKeyboard,
  disableKittyKeyboard,
  enableBracketedPaste,
  disableBracketedPaste,
  detectCapabilities,
  type KeyEvent,
  type MouseModeOptions,
  type ColorLevel,
} from '@mudah-cli/terminal';
import { sleekDark, type Theme } from '@mudah-cli/ui';
import { ScreenBuffer } from './screen-buffer.js';
import { DiffRenderer } from './diff-renderer.js';
import { blitLines } from './blit.js';
import { dumpTree, type TreeNode } from './dump.js';
import type { Layout } from './layout.js';

export interface ProgramOptions {
  /** Output stream. Defaults to `process.stdout`. */
  stdout?: {
    write(data: string): unknown;
    isTTY?: boolean;
    columns?: number;
    rows?: number;
    on?: (event: string, fn: () => void) => void;
    off?: (event: string, fn: () => void) => void;
  };
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
  /** Theme used when painting styled cells. Default sleek-dark. */
  theme?: Theme;
  /** Color level. Default from capability detection. */
  colorLevel?: ColorLevel;
  /** Called for every key event, including repeats and releases. */
  onKey?: (event: KeyEvent) => void;
}

/**
 * A full-screen terminal program: owns the alt-buffer lifecycle, the raw-mode
 * key pump, and scheduled repaints.
 *
 * `Container` is a Column. `Row`, `Split`, `Stack`, and `Overlay` are also
 * valid roots.
 *
 * `esc` quits with 0 unless the root consumes it (an open Overlay).
 * `ctrl+c` quits with 130.
 */
export class Program {
  private readonly stdout: {
    write(data: string): unknown;
    isTTY?: boolean;
    columns?: number;
    rows?: number;
    on?: (event: string, fn: () => void) => void;
    off?: (event: string, fn: () => void) => void;
  };
  private readonly stdin?: NodeJS.ReadStream;
  private readonly frameMs: number;
  private readonly inline: boolean;
  private readonly mouse: MouseModeOptions | false;
  private readonly keyboard: boolean;
  private readonly theme: Theme;
  private readonly colorLevel: ColorLevel;
  private readonly onKeyHook: ((event: KeyEvent) => void) | undefined;

  private container: Layout | undefined;
  private readonly renderer = new DiffRenderer();
  private running = false;
  private dirty = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private parser = new KeyParser();
  private exitRaw: (() => void) | null = null;
  private dataListener: ((chunk: Buffer | string) => void) | null = null;
  private resolveRun: ((code: number) => void) | null = null;
  private lastTickAt = 0;
  private readonly onResize = (): void => {
    this.renderer.reset();
    this.requestFrame();
    this.paint();
  };

  constructor(options: ProgramOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stdin = options.stdin ?? process.stdin;
    this.frameMs = options.frameMs ?? 16;
    this.inline = options.inline ?? false;
    this.mouse = options.mouse === true ? {} : options.mouse === undefined ? false : options.mouse;
    this.keyboard = options.keyboard === true;
    const caps = detectCapabilities();
    this.theme = options.theme ?? sleekDark;
    this.colorLevel = options.colorLevel ?? caps.colorLevel;
    this.onKeyHook = options.onKey;
  }

  /** Set (or replace) the component tree. */
  mount(container: Layout): void {
    this.container = container;
    this.requestFrame();
  }

  requestFrame(): void {
    this.dirty = true;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** JSON tree of the mounted layout. */
  dump(): TreeNode {
    if (!this.container) throw new Error('[tui] dump() needs a mounted layout.');
    this.container.resize(this.stdout.columns ?? 80, this.stdout.rows ?? 24);
    return dumpTree(this.container);
  }

  /**
   * Enter the TUI and run until {@link quit}. Resolves with the exit code
   * passed to `quit()`, disposes the program, and restores the terminal.
   */
  async run(): Promise<number> {
    if (!this.container) throw new Error('[tui] mount() a layout (Container, Column, Row, Split, Stack, or Overlay) before run().');
    if (this.running) return 0;

    const tty = this.stdin?.isTTY === true && this.stdout.isTTY === true;
    try {
      this.running = true;

      if (!this.inline && tty) {
        this.stdout.write('\x1b[?1049h\x1b[H');
      }
      if (tty) {
        this.stdout.write('\x1b[?25l');
        this.stdout.write(enableBracketedPaste());
        if (this.mouse !== false) this.stdout.write(enableMouse(this.mouse));
        if (this.keyboard) this.stdout.write(enableKittyKeyboard());
        this.exitRaw = enterRawMode(this.stdin!);
        this.dataListener = (chunk): void => {
          for (const event of this.parser.feed(String(chunk))) {
            this.handleKey(event);
          }
          if (this.mouse !== false) this.handleMouse(stringChunk(chunk));
        };
        this.stdin!.on('data', this.dataListener);
        this.stdout.on?.('resize', this.onResize);
      }

      const code = await new Promise<number>((resolve) => {
        this.resolveRun = resolve;
        this.lastTickAt = Date.now();
        this.timer = setInterval(() => this.tick(), this.frameMs);
        this.paint();
      });
      return code;
    } finally {
      this.dispose();
    }
  }

  quit(exitCode = 0): void {
    if (!this.running || !this.resolveRun) return;
    const resolve = this.resolveRun;
    this.resolveRun = null;
    resolve(exitCode);
  }

  private tick(): void {
    const now = Date.now();
    const dt = this.lastTickAt === 0 ? this.frameMs : now - this.lastTickAt;
    this.lastTickAt = now;
    this.container?.tick(dt);
    this.paint();
  }

  private handleKey(event: KeyEvent): void {
    this.onKeyHook?.(event);
    if (event.kind === 'release') return;
    if (event.name === 'ctrl+c') {
      this.quit(130);
      return;
    }
    if (event.name === 'escape') {
      if (this.container?.handleKey(event)) {
        this.requestFrame();
        return;
      }
      this.quit(0);
      return;
    }
    this.container?.handleKey(event);
    this.requestFrame();
  }

  private handleMouse(chunk: string): void {
    const events = parseMouseEvents(chunk);
    if (events.length === 0) return;
    for (const event of events) {
      if (this.container?.handleMouse(event)) this.requestFrame();
    }
  }

  private paint(): void {
    if (!this.container) return;
    const width = this.stdout.columns ?? 80;
    const height = this.stdout.rows ?? 24;
    this.container.resize(width, height);
    const buffer = new ScreenBuffer(width, height);
    blitLines(buffer, this.container.render());
    this.renderer.paint(this.stdout, buffer, this.theme, this.colorLevel);
    this.container.paintExtras(this.stdout, 0, 0);
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.dataListener && this.stdin) {
      this.stdin.off('data', this.dataListener);
      this.dataListener = null;
    }
    this.stdout.off?.('resize', this.onResize);
    this.exitRaw?.();
    this.exitRaw = null;
    const tty = this.stdin?.isTTY === true && this.stdout.isTTY === true;
    let out = '';
    if (!this.inline && tty) out += '\x1b[?1049l';
    if (tty) out += disableBracketedPaste();
    if (this.mouse !== false && tty) out += disableMouse(this.mouse);
    if (this.keyboard && tty) out += disableKittyKeyboard();
    out += '\x1b[?25h';
    this.stdout.write(out);
    this.running = false;
    this.resolveRun = null;
  }
}

function stringChunk(chunk: Buffer | string): string {
  return String(chunk);
}
