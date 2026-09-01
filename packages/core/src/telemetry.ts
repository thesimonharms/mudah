/**
 * Opt-in boot/perf telemetry. Disabled by default; enable via
 * `telemetry: true` in `mudah.json` or by injecting a sink in tests.
 */

export interface TelemetryEvent {
  readonly name: string;
  readonly ts: number;
  readonly durationMs?: number;
  readonly data?: Record<string, unknown>;
}

export interface TelemetrySink {
  record(event: TelemetryEvent): void;
}

export interface TelemetryOptions {
  /** Off unless the app opts in. */
  enabled?: boolean;
  /** Destination for events. Tests inject a collecting sink. */
  sink?: TelemetrySink;
}

export interface Telemetry {
  readonly enabled: boolean;
  record(name: string, data?: Record<string, unknown>): void;
  recordDuration(name: string, durationMs: number, data?: Record<string, unknown>): void;
}

const noopSink: TelemetrySink = {
  record(): void {},
};

/** Build a telemetry handle. Recording is a no-op when `enabled` is false. */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const enabled = options.enabled === true;
  const sink = options.sink ?? noopSink;
  return {
    enabled,
    record(name: string, data?: Record<string, unknown>): void {
      if (!enabled) return;
      sink.record({ name, ts: Date.now(), data });
    },
    recordDuration(name: string, durationMs: number, data?: Record<string, unknown>): void {
      if (!enabled) return;
      sink.record({ name, durationMs, ts: Date.now(), data });
    },
  };
}
