import { Command } from '@mudah-cli/console';
import { TestTui } from '@mudah-cli/testing';
import {
  Calendar,
  Chart,
  Checkbox,
  Column,
  DatePicker,
  Label,
  List,
  Pager,
  ProgressBar,
  Table,
  Toolbar,
  type Layout,
} from '@mudah-cli/tui';

function story(name: string, root: Layout, cols = 40, rows = 6): { name: string; snapshot: string } {
  return { name, snapshot: TestTui.mount(root, { cols, rows }).snapshot() };
}

/**
 * Built-in `storybook` command: widget gallery with live resize.
 */
export default class StorybookCommand extends Command {
  signature = 'storybook {widget?} [--cols=] [--rows=]';
  description = 'Print a TUI widget gallery with optional resize';

  async handle(): Promise<number> {
    const cols = Number(this.option('cols') ?? 40) || 40;
    const rows = Number(this.option('rows') ?? 8) || 8;
    const filter = this.arg('widget');

    const stories = [
      story('label', new Column().add(new Label('Label story')), cols, Math.min(rows, 4)),
      story('list', new Column().add(new Label('List story'), new List(['alpha', 'beta'])), cols, rows),
      story(
        'toolbar',
        new Column().add(
          new Label('Toolbar story'),
          new Toolbar({ items: [{ id: 'run', label: 'Run' }, { id: 'stop', label: 'Stop' }] }),
        ),
        cols,
        rows,
      ),
      story('checkbox', new Column().add(new Label('Checkbox story'), new Checkbox({ label: 'enabled', checked: true })), cols, rows),
      story('progress', new Column().add(new Label('Progress story'), new ProgressBar(0.42)), cols, rows),
      story(
        'table',
        new Column().add(new Label('Table story'), new Table([{ header: 'Host' }, { header: 'State' }], [['db', 'up']])),
        cols,
        rows,
      ),
      story('pager', new Column().add(new Pager({ title: 'Pager story', lines: ['alpha', 'beta', 'gamma'] })), cols, rows),
      story('calendar', new Column().add(new Label('Calendar story'), new Calendar({ date: new Date('2026-09-01T00:00:00Z') })), cols, Math.max(rows, 10)),
      story('datepicker', new Column().add(new Label('DatePicker story'), new DatePicker({ date: new Date('2026-09-01T00:00:00Z') })), cols, Math.max(rows, 10)),
      story(
        'chart',
        new Column().add(new Label('Chart story'), new Chart({ kind: 'bar', entries: [{ label: 'a', value: 3 }, { label: 'b', value: 1 }] })),
        cols,
        rows,
      ),
    ];

    const shown = filter ? stories.filter((entry) => entry.name === filter) : stories;
    if (shown.length === 0) {
      throw this.usageError(`Unknown widget "${filter}".`, `Known: ${stories.map((s) => s.name).join(', ')}`);
    }

    this.output.section(`Storybook ${cols}x${rows}`);
    for (const entry of shown) {
      this.output.raw(`${entry.snapshot}\n\n`);
    }
    this.output.success('storybook complete');
    return 0;
  }
}
