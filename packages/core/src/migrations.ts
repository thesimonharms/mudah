import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One reversible schema/data change. */
export interface Migration {
  readonly id: string;
  up(): void | Promise<void>;
  down(): void | Promise<void>;
}

export interface MigrationState {
  readonly applied: string[];
}

export interface MigrationRunResult {
  readonly applied: string[];
}

/** Default version-table path: `<base>/.mudah/migrations.json`. */
export function defaultMigrationTable(basePath: string): string {
  return join(basePath, '.mudah', 'migrations.json');
}

/**
 * Apply or roll back a list of migrations, recording ids in a JSON table.
 * An empty set is a successful no-op (still writes the table).
 */
export class MigrationRunner {
  constructor(
    private readonly tablePath: string,
    private readonly migrations: readonly Migration[],
  ) {}

  load(): MigrationState {
    try {
      const parsed = JSON.parse(readFileSync(this.tablePath, 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return { applied: [] };
      const applied = (parsed as { applied?: unknown }).applied;
      if (!Array.isArray(applied)) return { applied: [] };
      return { applied: applied.filter((id): id is string => typeof id === 'string') };
    } catch {
      return { applied: [] };
    }
  }

  save(state: MigrationState): void {
    mkdirSync(dirname(this.tablePath), { recursive: true });
    writeFileSync(this.tablePath, `${JSON.stringify({ applied: state.applied }, null, 2)}\n`, 'utf8');
  }

  async run(direction: 'up' | 'down', to?: string): Promise<MigrationRunResult> {
    const state = this.load();
    const applied = new Set(state.applied);
    const next = [...state.applied];
    const changed: string[] = [];

    if (direction === 'up') {
      for (const migration of this.migrations) {
        if (applied.has(migration.id)) continue;
        await migration.up();
        next.push(migration.id);
        applied.add(migration.id);
        changed.push(migration.id);
        if (to !== undefined && migration.id === to) break;
      }
    } else {
      for (const migration of [...this.migrations].reverse()) {
        if (!applied.has(migration.id)) continue;
        await migration.down();
        const idx = next.lastIndexOf(migration.id);
        if (idx !== -1) next.splice(idx, 1);
        applied.delete(migration.id);
        changed.push(migration.id);
        if (to !== undefined && migration.id === to) break;
      }
    }

    this.save({ applied: next });
    return { applied: changed };
  }
}
