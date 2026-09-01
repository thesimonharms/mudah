import type { ReadStream } from 'node:tty';
import { isMouseEvent } from './mouse.js';

export type KeyName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'home'
  | 'end'
  | 'page-up'
  | 'page-down'
  | 'enter'
  | 'escape'
  | 'backspace'
  | 'delete'
  | 'tab'
  | 'shift-tab'
  | 'space'
  | `ctrl+${string}`
  | `alt+${string}`
  | string;

export type KeyKind = 'press' | 'repeat' | 'release';

export interface KeyEvent {
  name: KeyName;
  /** Raw character for printable keys. */
  ch?: string;
  /** Bracketed-paste payload when `name` is `paste`. */
  paste?: string;
  /**
   * How the key moved. Legacy terminals only ever send `press` (and treat
   * auto-repeat as another press). Kitty's keyboard protocol can also send
   * `repeat` and `release`. Omitted means `press`.
   */
  kind?: KeyKind;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  /** Present when `parseKeys` is called with `{ normalize: true }`. */
  readonly normalized?: NormalizedKey;
}

/** Modifier-stripped key shared by Kitty CSI-u and legacy ESC+letter. */
export interface NormalizedKey {
  name: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  ch?: string;
}

export interface ParseKeysOptions {
  /** Attach a `normalized` field on each event and treat ESC+letter as alt. */
  normalize?: boolean;
}

/** Progressive-enhancement bits for the Kitty keyboard protocol. */
export const KITTY_KEYBOARD = {
  /** Disambiguate Esc / alt / ctrl so they never collide with CSI. */
  disambiguate: 1,
  /** Report press, repeat, and release as separate events. */
  eventTypes: 2,
  /** Report shifted / base-layout alternate key codes. */
  alternateKeys: 4,
  /** Send every key (including letters) as a CSI u event. Needed for key-up. */
  allKeys: 8,
  /** Embed associated text in the CSI u sequence. */
  associatedText: 16,
} as const;

/**
 * Flags that give games real key-up: disambiguate + event types + all keys.
 * Letter keys otherwise never produce a release event.
 */
export const KITTY_KEYBOARD_KEYUP =
  KITTY_KEYBOARD.disambiguate | KITTY_KEYBOARD.eventTypes | KITTY_KEYBOARD.allKeys;

/** Push the Kitty keyboard protocol with `flags`. Default enables key-up. */
export function enableKittyKeyboard(flags: number = KITTY_KEYBOARD_KEYUP): string {
  return `\x1b[>${flags}u`;
}

/** Pop the Kitty keyboard protocol (restore whatever was in force before). */
export function disableKittyKeyboard(): string {
  return '\x1b[<u';
}

/** Enable bracketed paste (`ESC[?2004h`). */
export function enableBracketedPaste(): string {
  return '\x1b[?2004h';
}

/** Disable bracketed paste. */
export function disableBracketedPaste(): string {
  return '\x1b[?2004l';
}

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/**
 * Parse a raw input buffer into key events. Pure and synchronous.
 * Handles CSI sequences (arrows, home/end, paging, delete, CSI u), Kitty
 * keyboard releases, bare escape, alt+char, control characters, and
 * printable text. APC (Kitty graphics replies) is skipped.
 */
/**
 * Collapse a KeyEvent into a modifier-stripped shape. Kitty CSI-u events
 * (name `alt+a`, flags set) and legacy `alt+a` names land on the same object.
 */
export function normalizeKey(event: KeyEvent): NormalizedKey {
  let name = String(event.name);
  let alt = event.alt === true;
  let ctrl = event.ctrl === true;
  let shift = event.shift === true;
  let meta = event.meta === true;

  if (name.startsWith('ctrl+alt+')) {
    name = name.slice('ctrl+alt+'.length);
    ctrl = true;
    alt = true;
  } else if (name.startsWith('ctrl+')) {
    name = name.slice('ctrl+'.length);
    ctrl = true;
  } else if (name.startsWith('alt+')) {
    name = name.slice('alt+'.length);
    alt = true;
  } else if (name.startsWith('meta+')) {
    name = name.slice('meta+'.length);
    meta = true;
  }

  if (name === 'shift-tab') {
    name = 'tab';
    shift = true;
  }

  return event.ch === undefined
    ? { name, shift, alt, ctrl, meta }
    : { name, shift, alt, ctrl, meta, ch: event.ch };
}

/**
 * Merge a run of events so a bare `escape` followed by a printable letter
 * becomes a single alt+letter NormalizedKey (legacy ESC+char).
 */
export function normalizeKeys(events: readonly KeyEvent[]): NormalizedKey[] {
  const out: NormalizedKey[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i] as KeyEvent;
    const next = events[i + 1];
    if (event.name === 'escape' && next && isLegacyAltChar(next)) {
      out.push({
        name: next.ch ?? String(next.name),
        shift: next.shift === true,
        alt: true,
        ctrl: next.ctrl === true,
        meta: next.meta === true,
        ...(next.ch !== undefined ? { ch: next.ch } : {}),
      });
      i += 1;
      continue;
    }
    out.push(normalizeKey(event));
  }
  return out;
}

function isLegacyAltChar(event: KeyEvent): boolean {
  if (event.alt || event.ctrl || event.meta) return false;
  if (event.name === 'paste' || event.name === 'escape') return false;
  const ch = event.ch ?? (event.name.length === 1 ? event.name : undefined);
  return ch !== undefined && ch >= ' ' && ch <= '~';
}

export function parseKeys(buffer: string, options?: ParseKeysOptions): KeyEvent[] {
  const events: KeyEvent[] = [];
  if (isMouseEvent(buffer)) return events;
  const asAlt = options?.normalize === true;
  let i = 0;

  while (i < buffer.length) {
    const char = buffer[i] as string;

    if (char === '\x1b') {
      const rest = buffer.slice(i + 1);

      if (rest.startsWith('[200~')) {
        const end = buffer.indexOf(PASTE_END, i);
        if (end < 0) break;
        const payload = buffer.slice(i + PASTE_START.length, end);
        events.push({ name: 'paste', paste: payload, kind: 'press' });
        i = end + PASTE_END.length;
        continue;
      }

      // APC (Kitty graphics): ESC _ ... ST (ESC \). Skip, never a key.
      if (rest.startsWith('_')) {
        const st = rest.indexOf('\x1b\\');
        if (st < 0) break;
        i += 1 + st + 2;
        continue;
      }

      if (rest.startsWith('[') || rest.startsWith('O')) {
        const matcher =
          /^\[([0-9;:?]*)([\x40-\x7e])/.exec(rest) ?? /^O([\x40-\x7e])/.exec(rest);
        if (matcher) {
          const event = escapeSequence(matcher[1] ?? '', (matcher[2] ?? matcher[1]) as string);
          if (event) events.push(event);
          i += 1 + matcher[0].length;
          continue;
        }
        break;
      }
      if (rest.startsWith(' ')) {
        const ch = rest.slice(1, 2);
        events.push({ name: `alt+${ch}`, ch, alt: true, kind: 'press' });
        i += 2;
        continue;
      }
      // Legacy alt+letter (ESC + printable) when normalize is requested.
      // Default path keeps ESC as its own event so existing consumers hold.
      if (asAlt && rest.length > 0) {
        const ch = rest[0] as string;
        if (ch >= ' ' && ch !== '[' && ch !== 'O') {
          events.push({ name: `alt+${ch}`, ch, alt: true, kind: 'press' });
          i += 2;
          continue;
        }
      }
      events.push({ name: 'escape', kind: 'press' });
      i += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      events.push({ name: 'enter', ch: '\r', kind: 'press' });
      i += 1;
      continue;
    }
    if (char === '\x7f' || char === '\x08') {
      events.push({ name: 'backspace', kind: 'press' });
      i += 1;
      continue;
    }
    if (char === '\t') {
      events.push({ name: 'tab', kind: 'press' });
      i += 1;
      continue;
    }
    if (char >= '\x01' && char <= '\x1a') {
      const letter = String.fromCharCode(char.charCodeAt(0) + 96);
      events.push({ name: `ctrl+${letter}`, ctrl: true, kind: 'press' });
      i += 1;
      continue;
    }
    if (char < '\x20') {
      i += 1;
      continue;
    }
    if (char === ' ') {
      events.push({ name: 'space', ch: ' ', kind: 'press' });
      i += 1;
      continue;
    }

    events.push({ name: char, ch: char, kind: 'press' });
    i += 1;
  }

  if (options?.normalize) {
    return events.map((event) => ({ ...event, normalized: normalizeKey(event) }));
  }
  return events;
}

function parseModField(field: string | undefined): {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  kind: KeyKind;
} {
  const [modRaw, typeRaw] = (field ?? '1').split(':');
  const mod = Math.max(0, Number(modRaw ?? '1') - 1);
  const typeNum = typeRaw === undefined || typeRaw === '' ? 1 : Number(typeRaw);
  const kind: KeyKind = typeNum === 3 ? 'release' : typeNum === 2 ? 'repeat' : 'press';
  return {
    shift: (mod & 1) !== 0,
    alt: (mod & 2) !== 0,
    ctrl: (mod & 4) !== 0,
    meta: (mod & 8) !== 0,
    kind,
  };
}

function withMeta(event: KeyEvent, meta: boolean): KeyEvent {
  return meta ? { ...event, meta: true } : event;
}

function namedKey(
  base: KeyName,
  mods: { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean; kind: KeyKind },
  ch?: string,
): KeyEvent {
  let name: KeyName = base;
  if (mods.ctrl && mods.alt) name = `ctrl+alt+${base}`;
  else if (mods.ctrl) name = `ctrl+${base}`;
  else if (mods.alt) name = `alt+${base}`;
  else if (mods.meta) name = `meta+${base}`;
  return {
    name,
    ch,
    kind: mods.kind,
    shift: mods.shift,
    alt: mods.alt,
    ctrl: mods.ctrl,
    ...(mods.meta ? { meta: true } : {}),
  };
}

/** CSI u / functional-key mapping for the Kitty keyboard protocol. */
function fromKeyCode(code: number, mods: ReturnType<typeof parseModField>): KeyEvent | null {
  switch (code) {
    case 27:
      return withMeta({ name: 'escape', kind: mods.kind, shift: mods.shift, alt: mods.alt, ctrl: mods.ctrl }, mods.meta);
    case 13:
      return withMeta({ name: 'enter', ch: '\r', kind: mods.kind, shift: mods.shift, alt: mods.alt, ctrl: mods.ctrl }, mods.meta);
    case 9:
      return withMeta(
        mods.shift
          ? { name: 'shift-tab', kind: mods.kind, shift: true, alt: mods.alt, ctrl: mods.ctrl }
          : { name: 'tab', kind: mods.kind, shift: mods.shift, alt: mods.alt, ctrl: mods.ctrl },
        mods.meta,
      );
    case 127:
    case 8:
      return withMeta({ name: 'backspace', kind: mods.kind, shift: mods.shift, alt: mods.alt, ctrl: mods.ctrl }, mods.meta);
    case 32:
      return namedKey('space', mods, ' ');
    default:
      break;
  }
  if (code >= 32 && code <= 126) {
    const ch = String.fromCharCode(code);
    const base = ch === ' ' ? 'space' : ch;
    return namedKey(base, mods, ch);
  }
  return null;
}

function escapeSequence(code: string, letter: string): KeyEvent | null {
  const fields = code.split(';');
  const first = fields[0] ?? '';
  const mods = parseModField(fields[1]);

  if (letter === 'u') {
    // CSI ? flags u is a keyboard-flags query reply, not a key.
    if (first.startsWith('?')) return null;
    const keyCode = Number((first.split(':')[0] ?? '').replace('?', ''));
    if (!Number.isFinite(keyCode)) return null;
    return fromKeyCode(keyCode, mods);
  }

  const nav = (name: KeyName): KeyEvent =>
    withMeta(
      {
        name,
        kind: mods.kind,
        shift: mods.shift,
        alt: mods.alt,
        ctrl: mods.ctrl,
      },
      mods.meta,
    );

  switch (letter) {
    case 'A':
      return nav('up');
    case 'B':
      return nav('down');
    case 'C':
      return nav('right');
    case 'D':
      return nav('left');
    case 'H':
      return nav('home');
    case 'F':
      return nav('end');
    case 'Z':
      return withMeta({ name: 'shift-tab', kind: mods.kind, shift: true, alt: mods.alt, ctrl: mods.ctrl }, mods.meta);
    case '~': {
      const param = first.split(':')[0] ?? '';
      switch (param) {
        case '1':
        case '7':
          return nav('home');
        case '2':
          return nav('delete');
        case '3':
          return nav('delete');
        case '4':
        case '8':
          return nav('end');
        case '5':
          return nav('page-up');
        case '6':
          return nav('page-down');
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/**
 * Incremental key parser: feed raw chunks as they arrive, receive complete
 * key events. Partial escape sequences are held until the next chunk.
 */
export class KeyParser {
  private pending = '';
  private readonly options: ParseKeysOptions;

  constructor(options: ParseKeysOptions = {}) {
    this.options = options;
  }

  feed(chunk: string): KeyEvent[] {
    this.pending += chunk;
    const safe = this.safeSplitIndex(this.pending);
    if (safe < 0) return [];
    const ready = this.pending.slice(0, safe);
    this.pending = this.pending.slice(safe);

    if (isMouseEvent(ready)) return [];

    return parseKeys(ready, this.options);
  }

  /** Index up to which the buffer can be split without cutting a sequence. */
  private safeSplitIndex(text: string): number {
    const esc = text.lastIndexOf('\x1b');
    if (esc < 0) return text.length;
    const rest = text.slice(esc + 1);

    // ST (ESC \): terminator of an APC. The sequence ends two bytes later.
    if (rest.startsWith('\\')) return esc + 2;

    if (rest.startsWith('_')) {
      return rest.includes('\x1b\\') ? text.length : -1;
    }

    if (text.includes('\x1b[200~')) {
      const lastStart = text.lastIndexOf('\x1b[200~');
      const lastEnd = text.lastIndexOf('\x1b[201~');
      if (lastEnd < lastStart) return -1;
    }

    if (rest.startsWith('[<')) {
      return /^\[<\d+;\d+;\d+[Mm]$/.test(rest) ? text.length : -1;
    }
    if (rest.startsWith('[') && /\d+;\d+;\d+M$/.test(rest)) {
      return text.length;
    }
    if (rest.startsWith('M')) {
      return /^M[\x20-\x7f]{3}$/.test(rest) ? text.length : -1;
    }
    if (rest.length === 0) {
      return esc + 1;
    }
    if (rest[0] === '[') {
      return /^\[[0-9;:?]*[\x40-\x7e]$/.test(rest) ? text.length : -1;
    }
    if (rest[0] === 'O') {
      return /^O[\x40-\x7e]$/.test(rest) ? text.length : -1;
    }
    if (rest[0] === ' ') {
      return rest.length >= 2 ? text.length : -1;
    }
    return esc + 1;
  }
}

/** Enter raw mode on a TTY and return a cleanup function. */
export function enterRawMode(input: ReadStream): () => void {
  if (!input.isTTY) return () => {};
  input.setRawMode(true);
  input.resume();
  return () => {
    if (input.isTTY) input.setRawMode(false);
    input.pause();
  };
}
