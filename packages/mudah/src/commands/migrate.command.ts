import { Command } from '@mudah-cli/console';
import { MigrationRunner, defaultMigrationTable, t, type Migration } from '@mudah-cli/core';

/**
 * Built-in `migrate` — run registered migrations from `app.make('migrations')`
 * (or an empty set) against `.mudah/migrations.json`.
 */
export default class MigrateCommand extends Command {
  signature = 'migrate {direction=up} [--to=]';
  description = 'Run registered migrations (up/down)';

  async handle() {
    const direction = String(this.arg('direction') ?? 'up');
    if (direction !== 'up' && direction !== 'down') {
      throw this.usageError(`Unknown migrate direction "${direction}".`, 'Use up or down.');
    }
    const to = String(this.option('to') ?? '');
    const migrations = resolveMigrations(this.app);
    const runner = new MigrationRunner(defaultMigrationTable(this.app.basePath), migrations);
    const result = await runner.run(direction, to.length > 0 ? to : undefined);
    if (result.applied.length === 0) {
      this.output.info(t('migrate.empty'));
      return;
    }
    for (const id of result.applied) {
      this.output.success(`${direction} ${id}`);
    }
  }
}

function resolveMigrations(app: { has(abstract: string): boolean; make<T>(abstract: string): T }): Migration[] {
  if (!app.has('migrations')) return [];
  const value = app.make('migrations');
  return Array.isArray(value) ? (value as Migration[]) : [];
}
