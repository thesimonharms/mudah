import { Command } from '@mudah-cli/console';
import { t } from '@mudah-cli/core';

/**
 * Built-in `plugins:update` — re-scan installed plugins. No network;
 * prints "up to date" after a local rediscovery pass.
 */
export default class PluginsUpdateCommand extends Command {
  signature = 'plugins:update';
  description = 'Re-scan installed plugins';

  async handle() {
    const plugins = await this.app.reloadPlugins();
    this.output.success(t('plugins.upToDate'));
    this.output.keyValue('plugins', String(plugins.length));
    for (const warning of this.app.pluginWarnings()) {
      this.output.warn(warning);
    }
  }
}
