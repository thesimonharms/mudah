export interface Task {
  name: string;
  fn: () => Promise<void> | void;
  /** Names of tasks that must complete successfully before this one runs. */
  dependsOn?: string[];
}

export interface TaskTreeOptions {
  stream?: { write(data: string): unknown; isTTY?: boolean };
  unicode?: boolean;
  reducedMotion?: boolean;
  /** Cap on concurrently running tasks. Default: run them all. */
  concurrency?: number;
  /** ANSI style applied to the state glyph. */
  style?: (text: string) => string;
}

type TaskState = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

interface TaskRecord {
  task: Task;
  state: TaskState;
  /** Dependency depth (0 = root). Used to indent the tree view. */
  depth: number;
  ms?: number;
  error?: string;
  emitted?: boolean;
}

function mark(state: TaskState, unicode: boolean, style?: (text: string) => string): string {
  let glyph: string;
  if (state === 'ok') glyph = unicode ? '✓' : 'v';
  else if (state === 'failed') glyph = unicode ? '✗' : 'x';
  else if (state === 'skipped') glyph = unicode ? '⊘' : 's';
  else if (state === 'running') glyph = unicode ? '•' : '*';
  else glyph = unicode ? '·' : '.';
  return style ? style(glyph) : glyph;
}

/**
 * Runs tasks respecting `dependsOn` edges (a DAG), concurrency-limited, with a
 * live tree view where each task is indented by its dependency depth. Tasks
 * whose dependency failed are skipped (and skipped transitively), so a single
 * failing task never runs things that depend on it.
 */
export class TaskTree {
  private readonly stream: { write(data: string): unknown; isTTY?: boolean };
  private readonly unicode: boolean;
  private readonly style?: (text: string) => string;
  private readonly live: boolean;
  private readonly concurrency: number;
  private rows: TaskRecord[] = [];
  private renderedRows = 0;

  constructor(options: TaskTreeOptions = {}) {
    this.stream = options.stream ?? process.stderr;
    this.unicode = options.unicode ?? true;
    this.style = options.style;
    this.live = this.stream.isTTY === true && (options.reducedMotion ?? false) === false;
    this.concurrency = options.concurrency ?? Number.POSITIVE_INFINITY;
  }

  async run(tasks: Task[]): Promise<number> {
    const byName = new Map<string, TaskRecord>();
    this.rows = [];
    this.renderedRows = 0;
    for (const task of tasks) {
      const rec: TaskRecord = { task, state: 'pending', depth: -1 };
      byName.set(task.name, rec);
      this.rows.push(rec);
    }

    // Validate dependencies, detect cycles, and compute each task's depth.
    for (const task of tasks) this.computeDepth(task.name, byName, new Set());

    let failures = 0;
    const running = new Set<string>();
    let settled = false;
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const depsOk = (rec: TaskRecord): boolean =>
      (rec.task.dependsOn ?? []).every((d) => byName.get(d)!.state === 'ok');
    const depsFailed = (rec: TaskRecord): boolean =>
      (rec.task.dependsOn ?? []).some((d) => {
        const s = byName.get(d)!.state;
        return s === 'failed' || s === 'skipped';
      });

    const markSkipped = (name: string): void => {
      const rec = byName.get(name)!;
      if (rec.state !== 'pending') return;
      rec.state = 'skipped';
      rec.error = 'dependency failed';
      this.repaint();
    };

    const start = (name: string): void => {
      const rec = byName.get(name)!;
      if (rec.state !== 'pending') return;
      rec.state = 'running';
      running.add(name);
      this.repaint();
      const startedAt = performance.now();
      Promise.resolve()
        .then(() => rec.task.fn())
        .then(() => {
          rec.state = 'ok';
          rec.ms = Math.max(1, Math.round(performance.now() - startedAt));
        })
        .catch((error: unknown) => {
          rec.state = 'failed';
          rec.ms = Math.max(1, Math.round(performance.now() - startedAt));
          rec.error = error instanceof Error ? error.message : String(error);
          failures++;
        })
        .finally(() => {
          running.delete(name);
          this.repaint();
          schedule();
        });
    };

    const schedule = (): void => {
      if (settled) return;
      // Skip any task whose dependency already failed or was skipped.
      for (const rec of this.rows) {
        if (rec.state === 'pending' && depsFailed(rec)) markSkipped(rec.task.name);
      }
      // Start ready tasks up to the concurrency cap.
      for (const rec of this.rows) {
        if (running.size >= this.concurrency) break;
        if (rec.state === 'pending' && depsOk(rec)) start(rec.task.name);
      }
      // Done when nothing is pending or running.
      const outstanding = this.rows.some((r) => r.state === 'pending' || r.state === 'running');
      if (!outstanding) {
        settled = true;
        resolveDone();
      }
    };

    this.repaint();
    schedule();
    await done;
    return failures;
  }

  /** Validate a task's dependencies and compute its depth (longest dep chain). */
  private computeDepth(name: string, byName: Map<string, TaskRecord>, stack: Set<string>): number {
    const rec = byName.get(name);
    if (rec === undefined) {
      throw new Error(`[animation] TaskTree "${name}" depends on an unknown task.`);
    }
    if (rec.depth > -1) return rec.depth; // already computed.
    if (stack.has(name)) {
      throw new Error('[animation] TaskTree has a dependency cycle.');
    }
    stack.add(name);
    let max = -1;
    for (const dep of rec.task.dependsOn ?? []) {
      max = Math.max(max, this.computeDepth(dep, byName, stack));
    }
    stack.delete(name);
    rec.depth = max + 1;
    return rec.depth;
  }

  private renderLine(rec: TaskRecord): string {
    const indent = '  '.repeat(Math.max(0, rec.depth));
    const glyph = mark(rec.state, this.unicode, this.style);
    const parts = [`  ${indent}${glyph} ${rec.task.name}`];
    if (rec.ms !== undefined) parts.push(`${rec.ms}ms`);
    if (rec.state === 'failed' && rec.error) parts.push(`(${rec.error})`);
    if (rec.state === 'skipped' && rec.error) parts.push(`(${rec.error})`);
    return parts.join('  ');
  }

  private repaint(): void {
    if (!this.live) {
      for (const rec of this.rows) {
        if (!rec.emitted && rec.state !== 'pending' && rec.state !== 'running') {
          rec.emitted = true;
          this.stream.write(this.renderLine(rec) + '\n');
        }
      }
      return;
    }

    if (this.renderedRows > 0) {
      this.stream.write(`\x1b[${this.renderedRows}A\x1b[J`);
    }
    for (const rec of this.rows) {
      this.stream.write(this.renderLine(rec) + '\n');
    }
    this.renderedRows = this.rows.length;
  }
}
