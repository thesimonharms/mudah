import { join } from 'node:path';
import { Command } from '@mudah-cli/console';
import { t } from '@mudah-cli/core';
import { hotReloadPlugins } from '../watcher.js';

/**
 * Built-in `plugins:watch` — re-import providers when `node_modules` changes.
 */
export default class PluginsWatchCommand extends Command {
  signature = 'plugins:watch [--debounce=] [--once]';
  description = 'Watch node_modules and reload plugin providers';

  async handle(): Promise<number> {
    const debounce = Number(this.option('debounce') ?? 200) || 200;
    const dir = join(this.app.basePath, 'node_modules');
    this.output.section('Plugin watch');
    this.output.keyValue('dir', dir);
    this.output.keyValue('debounce', `${debounce}ms`);

    const plugins = await this.app.reloadPlugins();
    this.output.muted(`reloaded ${plugins.length} plugin(s)`);

    if (this.option('once') === true || process.stdin.isTTY !== true) {
      this.output.success(t('plugins.reloaded'));
      return 0;
    }

    const stop = hotReloadPlugins(
      this.app,
      () => {
        this.output.muted('change detected — reloading plugins…');
      },
      { debounceMs: debounce, dir },
    );
    this.output.muted('watching for plugin changes (ctrl+c to stop)');
    await new Promise<void>((resolve) => {
      process.once('SIGINT', () => {
        stop();
        resolve();
      });
    });
    return 0;
  }
}
