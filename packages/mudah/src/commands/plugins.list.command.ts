import { Command } from '@mudah-cli/console';
import { t, type PluginInfo } from '@mudah-cli/core';

/**
 * Built-in `plugins:list` — discovered plugins and how many providers each
 * registered. Alias: `plugins`.
 */
export default class PluginsListCommand extends Command {
  signature = 'plugins:list';
  description = 'List discovered plugins';
  aliases = ['plugins'];

  async handle() {
    const plugins = pluginsOf(this.app);
    if (plugins.length === 0) {
      this.output.info(t('plugins.none'));
      return;
    }
    this.output.section('Plugins');
    for (const plugin of plugins) {
      this.output.keyValue(plugin.name, `${plugin.providers.length} provider(s)`);
    }
    this.output.line();
    this.output.success(t('plugins.listed', { count: plugins.length }));
  }
}

function pluginsOf(app: { plugins?: () => readonly PluginInfo[] }): readonly PluginInfo[] {
  return typeof app.plugins === 'function' ? app.plugins() : [];
}
