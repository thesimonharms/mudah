import { join } from 'node:path';
import { Command, type ConsoleKernel } from '@mudah-cli/console';
import { createWatcher } from '../watcher.js';

/**
 * Built-in `watch` command: thin `dev` wrapper with an optional glob.
 * Non-TTY or `--once` runs the command once and exits (tests / CI).
 */
export default class WatchCommand extends Command {
  signature = 'watch {command?} {glob?} [--once]';
  description = 'Watch files and re-run a command (dev wrapper)';

  constructor(private readonly kernel: ConsoleKernel) {
    super();
  }

  async handle(): Promise<number> {
    const target = this.arg('command');
    const glob = this.arg('glob') ?? 'src/**';
    const once = this.option('once') === true;
    this.output.info(`watch glob=${glob}`);

    if (target === undefined) {
      this.output.muted('Pass a command to re-run, e.g. watch doctor src/**');
      return 0;
    }
    if (!this.kernel.has(target)) {
      throw this.usageError(`Unknown command "${target}".`, 'Run "help" to list all commands.');
    }

    const runOnce = async (): Promise<number> => {
      try {
        return await this.kernel.dispatch([target]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.error(message);
        return 1;
      }
    };

    const code = await runOnce();
    if (once || process.stdin.isTTY !== true) {
      this.output.muted('not watching (non-TTY or --once)');
      return code;
    }

    const base = this.app.basePath;
    const stop = createWatcher([join(base, glob), join(base, 'src'), join(base, 'config'), join(base, 'mudah.json')], () => {
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
    return 0;
  }
}
