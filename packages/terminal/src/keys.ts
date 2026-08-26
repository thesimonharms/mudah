import type { ReadStream } from 'node:tty';

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

export interface KeyEvent {
  name: KeyName;
  /** Raw character for printable keys. */
  ch?: string;
}

/**
 * Parse a raw input buffer into key events. Pure and synchronous.
 * Handles CSI sequences (arrows, home/end, paging, delete), bare escape,
 * alt+char, control characters, and printable text.
 */
export function parseKeys(buffer: string): KeyEvent[] {
  const events: KeyEvent[] = [];
  let i = 0;

  while (i < buffer.length) {
    const char = buffer[i] as string;

    if (char === '\x1b') {
      const rest = buffer.slice(i + 1);
      if (rest.startsWith('[') || rest.startsWith('O')) {
        const matcher = /^\[([0-9;?]*)([\x40-\x7e])/.exec(rest) ?? /^O([\x40-\x7e])/.exec(rest);
        if (matcher) {
          const event = escapeSequence(matcher[1] ?? '', (matcher[2] ?? matcher[1]) as string);
          if (event) events.push(event);
          i += 1 + matcher[0].length;
          continue;
        }
        // Incomplete sequence (should not happen for complete buffers).
        break;
      }
      if (rest.startsWith(' ')) {
        const ch = rest.slice(1, 2);
        events.push({ name: `alt+${ch}`, ch });
        i += 2;
        continue;
      }
      events.push({ name: 'escape' });
      i += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      events.push({ name: 'enter', ch: '\r' });
      i += 1;
      continue;
    }
    if (char === '\x7f' || char === '\x08') {
      events.push({ name: 'backspace' });
      i += 1;
      continue;
    }
    if (char === '\t') {
      events.push({ name: 'tab' });
      i += 1;
      continue;
    }
    if (char >= '\x01' && char <= '\x1a') {
      // ctrl+a .. ctrl+z
      const letter = String.fromCharCode(char.charCodeAt(0) + 96);
      events.push({ name: `ctrl+${letter}` });
      i += 1;
      continue;
    }
    if (char < '\x20') {
      i += 1;
      continue;
    }
    if (char === ' ') {
      events.push({ name: 'space', ch: ' ' });
      i += 1;
      continue;
    }

    events.push({ name: char, ch: char });
    i += 1;
  }

  return events;
}

function escapeSequence(code: string, letter: string): KeyEvent | null {
  const param = code.split(';')[0] ?? '';
  switch (letter) {
    case 'A':
      return { name: 'up' };
    case 'B':
      return { name: 'down' };
    case 'C':
      return { name: 'right' };
    case 'D':
      return { name: 'left' };
    case 'H':
      return { name: 'home' };
    case 'F':
      return { name: 'end' };
    case 'Z':
      return { name: 'shift-tab' };
    case '~':
      switch (param) {
        case '1':
          return { name: 'home' };
        case '2':
        case '3':
          return { name: 'delete' };
        case '4':
          return { name: 'end' };
        case '5':
          return { name: 'page-up' };
        case '6':
          return { name: 'page-down' };
        default:
          return null;
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

  feed(chunk: string): KeyEvent[] {
    this.pending += chunk;
    const safe = this.safeSplitIndex(this.pending);
    if (safe < 0) return [];
    const ready = this.pending.slice(0, safe);
    this.pending = this.pending.slice(safe);
    return parseKeys(ready);
  }

  /** Index up to which the buffer can be split without cutting a sequence. */
  private safeSplitIndex(text: string): number {
    const esc = text.lastIndexOf('\x1b');
    if (esc < 0) return text.length;
    const rest = text.slice(esc + 1);
    if (rest.length === 0) return -1; // bare escape: wait to see if a sequence follows
    if (rest[0] === '[') {
      // Complete only when a final byte (0x40–0x7e) terminates the sequence.
      return /^\[[0-9;?]*[\x40-\x7e]$/.test(rest) ? text.length : -1;
    }
    if (rest[0] === 'O') {
      return /^O[\x40-\x7e]$/.test(rest) ? text.length : -1;
    }
    if (rest[0] === ' ') {
      return rest.length >= 2 ? text.length : -1;
    }
    // Bare escape followed by other data: the escape itself is complete.
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
