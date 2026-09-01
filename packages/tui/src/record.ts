/**
 * Headless session record/replay. No PTY. The replay target is anything
 * with TestTui-style `send` / `paste` / `click` (including TestTui itself).
 */
export type SessionAction = {
  type: 'key' | 'text' | 'click' | 'paste';
  key?: string;
  text?: string;
  x?: number;
  y?: number;
};

export interface ReplayHandle {
  send(name: string, ch?: string): unknown;
  paste?(text: string): unknown;
  click?(x: number, y: number): unknown;
}

export class SessionRecorder {
  private readonly actions: SessionAction[] = [];

  record(action: SessionAction): this {
    this.actions.push({ ...action });
    return this;
  }

  dump(): SessionAction[] {
    return this.actions.map((action) => ({ ...action }));
  }

  replay(tui: ReplayHandle): void {
    for (const action of this.actions) {
      if (action.type === 'key' && action.key !== undefined) {
        tui.send(action.key);
        continue;
      }
      if (action.type === 'text' && action.text !== undefined) {
        for (const ch of action.text) tui.send(ch, ch);
        continue;
      }
      if (action.type === 'paste' && action.text !== undefined) {
        tui.paste?.(action.text);
        continue;
      }
      if (action.type === 'click') {
        tui.click?.(action.x ?? 0, action.y ?? 0);
      }
    }
  }
}
