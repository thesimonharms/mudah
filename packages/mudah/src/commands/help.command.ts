import { Command, type ConsoleKernel } from '@mudah-cli/console';
import { renderCommandHelp, renderCommandList } from '@mudah-cli/console';

/**
 * Built-in `help` command: lists all commands, or shows details for one.
 */
export default class HelpCommand extends Command {
  signature = 'help {command?}';
  description = 'Show help for the CLI or a specific command';

  private kernel: ConsoleKernel;

  constructor(kernel: ConsoleKernel) {
    super();
    this.kernel = kernel;
  }

  async handle() {
    const target = this.arg('command');
    const lines: string[] = [];

    if (target !== undefined) {
      const entry = this.kernel.get(target);
      if (!entry) {
        throw this.usageError(`Unknown command "${target}".`, 'Run "help" to list all commands.');
      }
      renderCommandHelp(this.app.manifest.name, entry, lines);
    } else {
      renderCommandList(this.app.manifest.name, this.app.manifest.version, this.kernel.list(), lines);
    }

    this.output.raw(lines.join('\n'));
  }
}
