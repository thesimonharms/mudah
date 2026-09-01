import { Command, type ConsoleKernel } from '@mudah-cli/console';

/**
 * Built-in `complete` — print tab-completion candidates for a partial argv.
 * Shell integration scripts (`--autocomplete`) call this.
 */
export default class CompleteCommand extends Command {
  signature = 'complete {line?}';
  description = 'Print tab-completion candidates';

  private kernel: ConsoleKernel;

  constructor(kernel: ConsoleKernel) {
    super();
    this.kernel = kernel;
  }

  async handle() {
    const line = this.arg('line');
    const argv = line === undefined || line === '' ? [] : String(line).split(/\s+/);
    const candidates = this.kernel.complete(argv);
    if (candidates.length > 0) this.output.raw(candidates.join('\n'));
  }
}
