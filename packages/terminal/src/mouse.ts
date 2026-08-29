/**
 * Mouse input parsing for modern terminals.
 *
 * Terminals report clicks as CSI sequences. Three encodings are in use:
 *
 * - **X10** (`\x1b[Mbxy`) — press only, coordinates capped at 223.
 * - **SGR 1006** (`\x1b[<b;x;yM/m`) — unlimited coordinates, press *and*
 *   release. Every terminal worth supporting speaks this.
 * - **Urxvt 1015** (`\x1b[b;x;yM`) — rare; handled for completeness.
 *
 * Programs enable reporting by writing the corresponding mode (see
 * {@link enableMouse} / {@link disableMouse}) and feed raw stdin through
 * {@link parseMouseEvents}. Coordinates arrive 1-based and are normalized
 * to 0-based here, matching how renderers address cells.
 */

/** Which buttons are held. */
export interface MouseButtons {
  readonly left: boolean;
  readonly middle: boolean;
  readonly right: boolean;
  /** Fourth button, or wheel-up in some encodings. */
  readonly extra: boolean;
}

/** A single mouse event on a cell. */
export interface MouseEvent {
  /** 0-based column. */
  readonly x: number;
  /** 0-based row. */
  readonly y: number;
  readonly buttons: MouseButtons;
  /** True when no button is pressed (a move or a release). */
  readonly hover: boolean;
  /** True for a button release rather than a press. */
  readonly release: boolean;
  readonly drag: boolean;
  /** Mouse wheel direction, when this event came from a wheel. */
  readonly wheel?: 'up' | 'down';
  /** Set of modifiers held during the event. */
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}

const NO_BUTTONS: MouseButtons = { left: false, middle: false, right: false, extra: false };

// \x1b[M<b><x><y> — X10 / 1000 mode, coordinates offset by 32.
const X10 = /\x1b\[M([\x20-\x7f])([\x20-\x7f])([\x20-\x7f])/g;
// \x1b[<0;1;2M — SGR 1006: params then a final M (press) or m (release).
const SGR = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
// \x1b[0;1;2M — urxvt 1015.
const URXVT = /\x1b\[(\d+);(\d+);(\d+)M/g;

/**
 * Decode a raw input chunk into mouse events. Terminals that don't report
 * the mouse simply never match, so this is safe to run on every keystroke.
 *
 * A terminal speaks one encoding at a time. SGR is tried first, and when it
 * matches the chunk, the older encodings are skipped — otherwise an SGR
 * report can also look like a stray X10 one.
 */
export function parseMouseEvents(buffer: string): MouseEvent[] {
  const sgr = [...buffer.matchAll(SGR)];
  if (sgr.length > 0) {
    return sgr.map((match) =>
      decode(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1, match[4] === 'm'),
    );
  }

  const x10 = [...buffer.matchAll(X10)];
  if (x10.length > 0) {
    return x10.map((match) =>
      decode(
        (match[1] as string).charCodeAt(0) - 32,
        (match[2] as string).charCodeAt(0) - 33,
        (match[3] as string).charCodeAt(0) - 33,
        false,
      ),
    );
  }

  return [...buffer.matchAll(URXVT)].map((match) =>
    decode(Number(match[1]) - 32, Number(match[2]) - 1, Number(match[3]) - 1, false),
  );
}

/** True when the buffer looks like a mouse report. */
export function isMouseEvent(buffer: string): boolean {
  return /\x1b\[(M[\x20-\x7f]{3}|<\d+;\d+;\d+[Mm]|\d+;\d+;\d+M)/.test(buffer);
}

/**
 * Turn a protocol button code into an event.
 *
 * Layout of the low bits: `0b11` is the button (0 left, 1 middle, 2 right,
 * 3 none), `0b100000` marks motion, `0b100`/`0b1000`/`0b10000` are the
 * shift/alt/ctrl modifiers, and 64/65 are the wheel.
 */
function decode(code: number, x: number, y: number, release: boolean): MouseEvent {
  const wheel = wheelDirection(code);
  const button = code & 0b11;
  const motion = (code & 0b100000) !== 0;

  return {
    x,
    y,
    buttons: wheel === undefined ? buttonsFrom(button, release) : NO_BUTTONS,
    // "No button reported" covers both hover and release; SGR distinguishes
    // them by its final byte, which is what `release` carries.
    hover: wheel === undefined && button === 3 && motion,
    release: wheel === undefined && (release || (button === 3 && !motion)),
    drag: wheel === undefined && motion && button !== 3,
    ...(wheel === undefined ? {} : { wheel }),
    shift: (code & 0b100) !== 0,
    alt: (code & 0b1000) !== 0,
    ctrl: (code & 0b10000) !== 0,
  };
}

function wheelDirection(code: number): 'up' | 'down' | undefined {
  // 64 = wheel up, 65 = wheel down (button codes 4 and 5).
  if (code === 64) return 'up';
  if (code === 65) return 'down';
  return undefined;
}

function buttonsFrom(button: number, release: boolean): MouseButtons {
  if (release || button === 3) return NO_BUTTONS;
  return {
    left: button === 0,
    middle: button === 1,
    right: button === 2,
    extra: false,
  };
}

export interface MouseModeOptions {
  /** Report motion only while a button is held. */
  drag?: boolean;
  /** Report all motion, even with no button held. */
  motion?: boolean;
}

/**
 * The escape sequence that turns mouse reporting on. `1006` (SGR) is always
 * included: it's the only encoding that survives large terminals.
 */
export function enableMouse(options: MouseModeOptions = {}): string {
  const modes = ['1000', '1006'];
  if (options.drag === true) modes.unshift('1002');
  if (options.motion === true) modes.unshift('1003');
  return modes.map((mode) => `\x1b[?${mode}h`).join('');
}

/** The escape sequence that turns mouse reporting off. */
export function disableMouse(options: MouseModeOptions = {}): string {
  const modes = ['1000', '1006'];
  if (options.drag === true) modes.unshift('1002');
  if (options.motion === true) modes.unshift('1003');
  return modes.map((mode) => `\x1b[?${mode}l`).join('');
}
