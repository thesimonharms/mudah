import { Command, type ConsoleKernel } from '@mudah-cli/console';
import { createWatcher, pathsFromGlob } from '../watcher.js';

/**
 * Built-in `watch` command: re-run a command when files change.
 * Reads `mudah.json` `watch` defaults when args are omitted.
 */
export default class WatchCommand extends Command {
  signature = 'watch {command?} {glob?} [--once] [--debounce=]';
  description = 'Watch files and re-run a command';

  constructor(private readonly kernel: ConsoleKernel) {
    super();
  }

  async handle(): Promise<number> {
    const configured = this.app.manifest.watch;
    const target = this.arg('command') ?? configured?.command;
    const glob = this.arg('glob') ?? configured?.glob ?? 'src/**';
    const once = this.option('once') === true;
    const debounce = Number(this.option('debounce') ?? configured?.debounceMs ?? 150) || 150;
    this.output.info(`watch glob=${glob} debounce=${debounce}ms`);

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
    const stop = createWatcher(
      pathsFromGlob(base, glob),
      (filename) => {
        if (filename) process.env['MUDAH_WATCH_FILE'] = filename;
        this.output.muted('change detected — re-running…');
        void runOnce();
      },
      { debounceMs: debounce, ignore: configured?.ignore },
    );
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
