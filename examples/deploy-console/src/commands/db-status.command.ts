import { Command } from '@mudah-cli/mudah';

/** `db status` — grouped command in the `db` namespace. */
export default class DbStatusCommand extends Command {
  signature = 'db:status';
  description = 'Show migration status';
  groupDescription = 'Database operations';

  async handle(): Promise<number> {
    const migrations = this.migrations();
    this.output.section('Migrations');
    this.output.table(
      [
        { header: 'id', align: 'left' },
        { header: 'name', align: 'left' },
        { header: 'status', align: 'right' },
      ],
      migrations.map((m) => [m.id, m.name, m.applied ? 'applied' : 'pending']),
    );
    const pending = migrations.filter((m) => !m.applied).length;
    this.output.raw('\n');
    this.output.info(`${migrations.length - pending} applied, ${pending} pending`);
    return 0;
  }

  private migrations(): Array<{ id: string; name: string; applied: boolean }> {
    return [
      { id: '001', name: 'create_users', applied: true },
      { id: '002', name: 'create_orders', applied: true },
      { id: '003', name: 'add_indexes', applied: false },
    ];
  }
}
