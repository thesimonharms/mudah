/**
 * Headless session record/replay. No PTY. The replay target is anything
 * with TestTui-style `send` / `paste` / `click` / `resize`.
 */
export type SessionAction = {
  type: 'key' | 'text' | 'click' | 'paste' | 'resize';
  key?: string;
  text?: string;
  x?: number;
  y?: number;
  cols?: number;
  rows?: number;
  /** Milliseconds from tape start. */
  t?: number;
};

export interface SessionTape {
  version: 1;
  recordedAt: string;
  cols?: number;
  rows?: number;
  events: SessionAction[];
}

export interface ReplayHandle {
  send(name: string, ch?: string): unknown;
  paste?(text: string): unknown;
  click?(x: number, y: number): unknown;
  resize?(cols: number, rows: number): unknown;
}

export function isSessionAction(value: unknown): value is SessionAction {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'key' || type === 'text' || type === 'click' || type === 'paste' || type === 'resize';
}

export function parseSessionTape(raw: unknown): SessionTape {
  if (Array.isArray(raw)) {
    return {
      version: 1,
      recordedAt: new Date(0).toISOString(),
      events: raw.filter(isSessionAction),
    };
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('[tui] session tape must be an object or array');
  }
  const rec = raw as { version?: unknown; recordedAt?: unknown; cols?: unknown; rows?: unknown; events?: unknown };
  const events = Array.isArray(rec.events) ? rec.events.filter(isSessionAction) : [];
  return {
    version: 1,
    recordedAt: typeof rec.recordedAt === 'string' ? rec.recordedAt : new Date(0).toISOString(),
    cols: typeof rec.cols === 'number' ? rec.cols : undefined,
    rows: typeof rec.rows === 'number' ? rec.rows : undefined,
    events,
  };
}

export class SessionRecorder {
  private readonly actions: SessionAction[] = [];
  private readonly started = Date.now();
  private cols?: number;
  private rows?: number;

  record(action: SessionAction): this {
    const t = action.t ?? Date.now() - this.started;
    this.actions.push({ ...action, t });
    if (action.type === 'resize') {
      this.cols = action.cols;
      this.rows = action.rows;
    }
    return this;
  }

  dump(): SessionAction[] {
    return this.actions.map((action) => ({ ...action }));
  }

  tape(): SessionTape {
    return {
      version: 1,
      recordedAt: new Date(this.started).toISOString(),
      cols: this.cols,
      rows: this.rows,
      events: this.dump(),
    };
  }

  replay(tui: ReplayHandle, options: { speed?: number } = {}): void {
    const speed = options.speed ?? 1;
    void speed;
    for (const action of this.actions) applyAction(tui, action);
  }
}

export function replayTape(tui: ReplayHandle, tape: SessionTape, options: { speed?: number } = {}): void {
  if (tape.cols !== undefined && tape.rows !== undefined) tui.resize?.(tape.cols, tape.rows);
  const rec = new SessionRecorder();
  for (const event of tape.events) rec.record(event);
  rec.replay(tui, options);
}

/**
 * Timed replay that honors `t` timestamps. `speed` is a divisor (2 = twice
 * as fast). Inject `sleep` in tests; default is `setTimeout`.
 */
export async function replayTapeAsync(
  tui: ReplayHandle,
  tape: SessionTape,
  options: { speed?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const speed = Math.max(0.01, options.speed ?? 1);
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (tape.cols !== undefined && tape.rows !== undefined) tui.resize?.(tape.cols, tape.rows);
  let last = 0;
  for (const event of tape.events) {
    const at = event.t ?? last;
    const wait = Math.max(0, (at - last) / speed);
    if (wait > 0) await sleep(wait);
    applyAction(tui, event);
    last = at;
  }
}

function applyAction(tui: ReplayHandle, action: SessionAction): void {
  if (action.type === 'key' && action.key !== undefined) {
    tui.send(action.key);
    return;
  }
  if (action.type === 'text' && action.text !== undefined) {
    for (const ch of action.text) tui.send(ch, ch);
    return;
  }
  if (action.type === 'paste' && action.text !== undefined) {
    tui.paste?.(action.text);
    return;
  }
  if (action.type === 'click') {
    tui.click?.(action.x ?? 0, action.y ?? 0);
    return;
  }
  if (action.type === 'resize') {
    tui.resize?.(action.cols ?? 80, action.rows ?? 24);
  }
}
