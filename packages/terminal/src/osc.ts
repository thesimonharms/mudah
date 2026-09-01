const BEL = '\x07';
const SEP = '\x1f'; // OSC 9 unit separator

function oscSequence(code: number, payload: string): string {
  return `\x1b]${code};${payload}${BEL}`;
}

/** Wrap `text` in an OSC 8 hyperlink. Width of the result is `text` only. */
export function hyperlinkWrap(uri: string, text: string): string {
  if (uri === '') return text;
  return `\x1b]8;;${uri}\x1b\\${text}\x1b]8;;\x1b\\`;
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

  /**
   * OSC 9;1 progress. `percent` is clamped to 0–100.
   * Terminals that understand the 9.1 variant treat this as a determinate
   * progress indicator; others ignore it.
   */
  progress(stream: OscWriter, percent: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    stream.write(oscSequence(9, `1;${clamped}`));
  },

  /**
   * OSC 9;2 bell variant. A notification-channel bell, distinct from
   * the ASCII BEL used by `osc.notify`.
   */
  bell(stream: OscWriter): void {
    stream.write(oscSequence(9, '2'));
  },

  /** OSC 8 hyperlink: `text` renders as a clickable link to `uri`. */
  hyperlink(stream: OscWriter, uri: string, text: string): void {
    stream.write(hyperlinkWrap(uri, text));
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

  /** OSC 7: announce the working directory so the terminal tracks cwd. */
  workingDir(stream: OscWriter, cwd: string): void {
    stream.write(oscSequence(7, `file://${encodeURI(cwd)}`));
  },
};

/**
 * Wrap a stream with OSC capability guards: emitters become no-ops when the
 * capability is unavailable.
 */
export function guardedOsc(stream: OscWriter, caps: { osc9: boolean; osc133: boolean; osc7: boolean }) {
  return {
    title: (title: string) => osc.title(stream, title),
    notify: (title: string, message: string) => {
      if (caps.osc9) osc.notify(stream, title, message);
    },
    /** No dedicated 9.1/9.2 capability — always emit. */
    progress: (percent: number) => osc.progress(stream, percent),
    bell: () => osc.bell(stream),
    hyperlink: (uri: string, text: string) => osc.hyperlink(stream, uri, text),
    workingDir: (cwd: string) => {
      if (caps.osc7) osc.workingDir(stream, cwd);
    },
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
