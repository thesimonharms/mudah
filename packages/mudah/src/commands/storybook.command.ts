import { Command } from '@mudah-cli/console';
import { TestTui } from '@mudah-cli/testing';
import { Column, Label, List, Toolbar } from '@mudah-cli/tui';

/**
 * Built-in `storybook` command: a widget gallery printed via TestTui
 * snapshots of Label, List, and Toolbar.
 */
export default class StorybookCommand extends Command {
  signature = 'storybook';
  description = 'Print a TUI widget gallery (Label, List, Toolbar)';

  async handle(): Promise<number> {
    const label = TestTui.mount(new Column().add(new Label('Label story')), { cols: 40, rows: 4 });
    const list = TestTui.mount(new Column().add(new Label('List story'), new List(['alpha', 'beta'])), {
      cols: 40,
      rows: 6,
    });
    const toolbar = TestTui.mount(
      new Column().add(
        new Label('Toolbar story'),
        new Toolbar({ items: [{ id: 'run', label: 'Run' }, { id: 'stop', label: 'Stop' }] }),
      ),
      { cols: 40, rows: 5 },
    );

    this.output.section('Storybook');
    this.output.raw(`${label.snapshot()}\n\n`);
    this.output.raw(`${list.snapshot()}\n\n`);
    this.output.raw(`${toolbar.snapshot()}\n`);
    this.output.success('storybook complete');
    return 0;
  }
}
