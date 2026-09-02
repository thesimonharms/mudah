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
  Program,
  ProgressBar,
  StorybookGallery,
  Table,
  Toolbar,
  type Layout,
  type StoryFactory,
} from '@mudah-cli/tui';

function stories(): StoryFactory[] {
  return [
    { name: 'label', build: () => new Column().add(new Label('Label story')) },
    { name: 'list', build: () => new Column().add(new Label('List story'), new List(['alpha', 'beta'])) },
    {
      name: 'toolbar',
      build: () =>
        new Column().add(
          new Label('Toolbar story'),
          new Toolbar({ items: [{ id: 'run', label: 'Run' }, { id: 'stop', label: 'Stop' }] }),
        ),
    },
    { name: 'checkbox', build: () => new Column().add(new Label('Checkbox story'), new Checkbox({ label: 'enabled', checked: true })) },
    { name: 'progress', build: () => new Column().add(new Label('Progress story'), new ProgressBar(0.42)) },
    {
      name: 'table',
      build: () =>
        new Column().add(new Label('Table story'), new Table([{ header: 'Host' }, { header: 'State' }], [['db', 'up']])),
    },
    { name: 'pager', build: () => new Column().add(new Pager({ title: 'Pager story', lines: ['alpha', 'beta', 'gamma'] })) },
    {
      name: 'calendar',
      build: () => new Column().add(new Label('Calendar story'), new Calendar({ date: new Date('2026-09-01T00:00:00Z') })),
    },
    {
      name: 'datepicker',
      build: () => new Column().add(new Label('DatePicker story'), new DatePicker({ date: new Date('2026-09-01T00:00:00Z') })),
    },
    {
      name: 'chart',
      build: () =>
        new Column().add(
          new Label('Chart story'),
          new Chart({ kind: 'bar', entries: [{ label: 'a', value: 3 }, { label: 'b', value: 1 }] }),
        ),
    },
  ];
}

function snapshot(root: Layout, cols: number, rows: number): string {
  return TestTui.mount(root, { cols, rows }).snapshot();
}

/**
 * Built-in `storybook` command: widget gallery. Prints snapshots when not a
 * TTY. On a TTY, opens a Program: left/right pick a widget, +/− resize.
 */
export default class StorybookCommand extends Command {
  signature = 'storybook {widget?} [--cols=] [--rows=]';
  description = 'Open a TUI widget gallery with live resize';

  async handle(): Promise<number> {
    const cols = Number(this.option('cols') ?? 40) || 40;
    const rows = Number(this.option('rows') ?? 8) || 8;
    const filter = this.arg('widget');
    const all = stories();
    const shown = filter ? all.filter((entry) => entry.name === filter) : all;
    if (shown.length === 0) {
      throw this.usageError(`Unknown widget "${filter}".`, `Known: ${all.map((s) => s.name).join(', ')}`);
    }

    const tty = process.stdin.isTTY === true && process.stdout.isTTY === true;
    if (tty && process.env['VITEST'] === undefined) {
      const gallery = new StorybookGallery(shown, cols, rows);
      const program = new Program();
      program.mount(gallery);
      return program.run();
    }

    this.output.section(`Storybook ${cols}x${rows}`);
    for (const entry of shown) {
      this.output.raw(`${snapshot(entry.build(cols, rows), cols, rows)}\n\n`);
    }
    this.output.success('storybook complete');
    return 0;
  }
}
