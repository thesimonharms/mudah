import { join } from 'node:path';
import { Command, type ConsoleKernel } from '@mudah-cli/console';
import { createWatcher } from '../watcher.js';

/**
 * Built-in `dev` command: run a command, then re-run it whenever
 * src/, config/, or mudah.json change (150ms debounce). Exits on SIGINT.
 */
export default class DevCommand extends Command {
  signature = 'dev {command}';
  description = 'Watch mode: re-run a command when files change';

  private kernel: ConsoleKernel;

  constructor(kernel: ConsoleKernel) {
    super();
    this.kernel = kernel;
  }

  async handle() {
    const target = this.arg('command')!;
    if (!this.kernel.has(target)) {
      throw this.usageError(`Unknown command "${target}".`, 'Run "help" to list all commands.');
    }

    const runOnce = async (): Promise<void> => {
      try {
        await this.kernel.dispatch([target]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.error(message);
      }
    };

    await runOnce();

    const base = this.app.basePath;
    const stop = createWatcher([join(base, 'src'), join(base, 'config'), join(base, 'mudah.json')], () => {
      this.output.muted('change detected — re-running…');
      void runOnce();
    });

    this.output.muted('watching for changes (ctrl+c to stop)');
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => {
        stop();
        resolve();
      });
    });
  }
}
