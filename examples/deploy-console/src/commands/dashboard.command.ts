import { Command } from '@mudah-cli/mudah';
import { Container, Label, Panel, Program, Table, Viewport } from '@mudah-cli/mudah/tui';

/**
 * Full-screen dashboard: a scrolling viewport over a table of services,
 * with mouse support (wheel to scroll, click to select) and a live panel.
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
    ]);

    // The viewport scrolls the table when it outgrows the screen.
    const viewport = new Viewport(table, 12);

    const program = new Program({ mouse: true });
    const container = new Container()
      .add(new Label('Deploy Console — esc to exit'))
      .add(summary)
      .add(viewport);

    program.mount(container);

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
