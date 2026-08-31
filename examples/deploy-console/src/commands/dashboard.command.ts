import { Command } from '@mudah-cli/mudah';
import { Column, Label, Panel, Program, Split, Table, Viewport } from '@mudah-cli/mudah/tui';

/**
 * Full-screen dashboard: a sidebar summary beside a scrolling table,
 * with mouse support (wheel to scroll, drag the split bar, click to select).
 */
export default class DashboardCommand extends Command {
  signature = 'dashboard';
  description = 'Open the full-screen deployment dashboard';

  async handle(): Promise<number> {
    const services = this.services();

    const table = new Table(
      [
        { header: 'service', align: 'left' },
        { header: 'env', align: 'left' },
        { header: 'status', align: 'right' },
      ],
      services.map((s) => [s.name, s.env, s.status]),
    );

    const summary = new Panel('Summary', [
      `${services.length} services tracked`,
      `default env: ${this.app.config().get<string>('deploy.defaultEnvironment', 'staging')}`,
      '',
      'up/down  move    enter  deploy',
      'wheel    scroll  esc    exit',
      'drag     split',
    ]);

    const program = new Program({ mouse: true });
    program.mount(
      new Column()
        .add(new Label('Deploy Console — esc to exit'))
        .add(new Split({ axis: 'horizontal', ratio: 0.38 }).add(summary, new Viewport(table, 12))),
    );

    const code = await program.run();
    if (code === 0) this.output.success('Dashboard closed.');
    return code;
  }

  private services(): Array<{ name: string; env: string; status: string }> {
    const names = [
      'api-gateway',
      'auth-service',
      'billing-worker',
      'image-resizer',
      'mail-sender',
      'search-indexer',
      'web-frontend',
      'analytics-sink',
    ];
    return names.map((name, i) => ({
      name,
      env: i % 2 === 0 ? 'production' : 'staging',
      status: i % 5 === 0 ? 'degraded' : 'healthy',
    }));
  }
}
