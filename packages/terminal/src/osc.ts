const BEL = '\x07';
const SEP = '\x1f'; // OSC 9 unit separator

function oscSequence(code: number, payload: string): string {
  return `\x1b]${code};${payload}${BEL}`;
}

export interface OscWriter {
  write(data: string): unknown;
}

/**
 * OSC (operating system command) emitters for modern terminal features:
 * titles, desktop notifications, hyperlinks, and semantic prompt markers.
 * All writers accept any stream-like object so they can be pointed at
 * buffers in tests.
 */
export const osc = {
  /** Set the terminal window/tab title. */
  title(stream: OscWriter, title: string): void {
    stream.write(oscSequence(0, title));
  },

  /**
   * Desktop notification. Uses OSC 9 with the unit separator (Ghostty) and
   * the legacy xterm OSC 777 form so at least one lands.
   */
  notify(stream: OscWriter, title: string, message: string): void {
    stream.write(oscSequence(9, `${title}${SEP}${message}`));
    stream.write(oscSequence(777, `notify;${title};${message}`));
  },

  /** OSC 8 hyperlink: `text` renders as a clickable link to `uri`. */
  hyperlink(stream: OscWriter, uri: string, text: string): void {
    const params = uri === '' ? '' : `8;;${uri}`;
    stream.write(`\x1b]${params}\x1b\\${text}\x1b]8;;\x1b\\`);
  },

  /** Mark the start of a prompt line (OSC 133 A). */
  promptStart(stream: OscWriter): void {
    stream.write(oscSequence(133, 'A'));
  },

  /** Mark the end of a prompt / start of the command (OSC 133 B). */
  promptEnd(stream: OscWriter): void {
    stream.write(oscSequence(133, 'B'));
  },

  /** Mark command output end, with exit status (OSC 133 D;status). */
  commandEnd(stream: OscWriter, status: number = 0): void {
    stream.write(oscSequence(133, `D;${status}`));
  },
};

/**
 * Wrap a stream with OSC capability guards: emitters become no-ops when the
 * capability is unavailable.
 */
export function guardedOsc(stream: OscWriter, caps: { osc9: boolean; osc133: boolean }) {
  return {
    title: (title: string) => osc.title(stream, title),
    notify: (title: string, message: string) => {
      if (caps.osc9) osc.notify(stream, title, message);
    },
    hyperlink: (uri: string, text: string) => osc.hyperlink(stream, uri, text),
    promptStart: () => {
      if (caps.osc133) osc.promptStart(stream);
    },
    promptEnd: () => {
      if (caps.osc133) osc.promptEnd(stream);
    },
    commandEnd: (status = 0) => {
      if (caps.osc133) osc.commandEnd(stream, status);
    },
  };
}
