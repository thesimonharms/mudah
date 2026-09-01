import type { Application } from './application.js';

/** Typed application lifecycle events. */
export interface AppEvents {
  'app.booted': { app: Application };
  'app.shutdown': { app: Application };
  'command.before': { command: string; argv: string[] };
  'command.after': { command: string; exitCode: number; durationMs: number };
  'command.error': { command: string; error: unknown };
  'config.changed': { key: string };
}

export type EventHandler<E> = (payload: E) => void | Promise<void>;

/**
 * Minimal typed event bus. Listeners run sequentially in registration order
 * and are awaited, so a listener may do async work (notifications, telemetry).
 */
export class EventBus {
  private readonly listeners = new Map<keyof AppEvents, Set<EventHandler<never>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof AppEvents>(event: K, handler: EventHandler<AppEvents[K]>): void {
    this.listeners.get(event)?.delete(handler as EventHandler<never>);
  }

  /** Emit to all subscribers, awaiting each in order. */
  async emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): Promise<void> {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      await (handler as EventHandler<AppEvents[K]>)(payload);
    }
  }
}
