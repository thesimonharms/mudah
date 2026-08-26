export interface TaskSpec {
  label: string;
  fn: () => Promise<void> | void;
}

export interface TaskRunnerOptions {
  stream?: { write(data: string): unknown; isTTY?: boolean };
  unicode?: boolean;
  reducedMotion?: boolean;
  /** Cap on concurrent tasks. Default: run them all. */
  concurrency?: number;
  style?: (text: string) => string;
}

interface TaskLine {
  label: string;
  state: 'running' | 'ok' | 'failed';
  ms?: number;
  error?: string;
  emitted?: boolean;
}

/**
 * Runs independent tasks concurrently with a live status line per task:
 *
 * ```
 *   • Building frontend
 *   ✓ Building backend      312ms
 *   ✗ Deploying staging     (ECONNREFUSED)
 * ```
 *
 * Mirrors the cargo/just-style parallel output. Non-TTY output degrades to
 * one line per completed task.
 */
export class TaskRunner {
  private readonly stream: { write(data: string): unknown; isTTY?: boolean };
  private readonly unicode: boolean;
  private readonly style?: (text: string) => string;
  private readonly live: boolean;
  private readonly concurrency: number;
  private lines: TaskLine[] = [];
  private renderedCount = 0;

  constructor(options: TaskRunnerOptions = {}) {
    this.stream = options.stream ?? process.stderr;
    this.unicode = options.unicode ?? true;
    this.style = options.style;
    this.live = this.stream.isTTY === true && (options.reducedMotion ?? false) === false;
    this.concurrency = options.concurrency ?? Number.POSITIVE_INFINITY;
  }

  /** Run all tasks (optionally capped), updating status lines live. Returns the failure count. */
  async run(tasks: TaskSpec[]): Promise<number> {
    const limit = Math.min(this.concurrency, tasks.length);
    let failures = 0;

    let index = 0;

    const launch = async (): Promise<void> => {
      while (index < tasks.length) {
        const current = index++;
        const spec = tasks[current]!;
        const lineIndex = this.lines.length;
        this.lines.push({ label: spec.label, state: 'running' });
        this.repaint();
        const taskIndex = lineIndex;

        const startedAt = performance.now();
        try {
          await spec.fn();
          this.lines[taskIndex]!.state = 'ok';
          this.lines[taskIndex]!.ms = Math.max(1, Math.round(performance.now() - startedAt));
        } catch (error) {
          this.lines[taskIndex]!.state = 'failed';
          this.lines[taskIndex]!.ms = Math.max(1, Math.round(performance.now() - startedAt));
          this.lines[taskIndex]!.error = error instanceof Error ? error.message : String(error);
          failures++;
        }
        this.repaint();
      }
    };

    await Promise.all(Array.from({ length: Math.max(1, limit) }, () => launch()));
    return failures;
  }

  private repaint(): void {
    if (!this.live) {
      // Non-tty: emit each line as it completes (order may be out of sequence).
      for (const line of this.lines) {
        if (!line.emitted && line.state !== 'running') {
          line.emitted = true;
          this.stream.write(this.renderLine(line) + '\n');
        }
      }
      return;
    }

    if (this.renderedCount > 0) {
      this.stream.write(`\x1b[${this.renderedCount}A\x1b[J`);
    }
    for (const line of this.lines) {
      this.stream.write(this.renderLine(line) + '\n');
    }
    this.renderedCount = this.lines.length;
  }

  private renderLine(line: TaskLine): string {
    const mark =
      line.state === 'running' ? (this.unicode ? '•' : '*') : line.state === 'ok' ? (this.unicode ? '✓' : 'v') : this.unicode ? '✗' : 'x';
    const glyph = this.style ? this.style(mark) : mark;
    const parts = [`  ${glyph} ${line.label}`];
    if (line.state !== 'running' && line.ms !== undefined) parts.push(`${line.ms}ms`);
    if (line.state === 'failed' && line.error) parts.push(`(${line.error})`);
    return parts.join('  ');
  }
}
