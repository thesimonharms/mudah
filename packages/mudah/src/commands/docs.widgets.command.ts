import { Command } from '@mudah-cli/console';
import { widgetReference, widgetReferenceMarkdown } from '@mudah-cli/tui';

/**
 * Built-in `docs:widgets` command: print the inspect()-generated
 * component reference.
 */
export default class DocsWidgetsCommand extends Command {
  signature = 'docs:widgets';
  description = 'Print the TUI widget reference generated from inspect()';

  async handle(): Promise<number> {
    this.output.raw(`${widgetReferenceMarkdown()}\n`);
    this.output.keyValue('widgets', String(widgetReference().length));
    return 0;
  }
}
