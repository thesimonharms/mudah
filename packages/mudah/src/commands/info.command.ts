import { Command } from '@mudah-cli/console';
import type { PluginInfo, ProviderHealth } from '@mudah-cli/core';

/** Built-in `info` command: dump runtime, app, and config info. */
export default class InfoCommand extends Command {
  signature = 'info [--json]';
  description = 'Show runtime, app, and config information';

  async handle() {
    const app = this.app;
    const output = this.output;
    const plugins = typeof app.plugins === 'function' ? app.plugins() : [];
    const pluginSummary = (plugins as PluginInfo[]).map((plugin) => ({
      name: plugin.name,
      providers: plugin.providers.length,
    }));
    let health: ProviderHealth[] | undefined;
    if (typeof app.health === 'function') {
      health = await app.health();
    }

    if (output.isMachineReadable || this.option('json') === true) {
      output.emit('data', 'info', {
        name: app.manifest.name,
        version: app.manifest.version,
        node: process.version,
        plugins: pluginSummary,
        ...(health === undefined ? {} : { health }),
      });
      return;
    }

    output.section('Runtime');
    output.keyValue('node', process.version);
    output.keyValue('platform', `${process.platform} ${process.arch}`);

    output.section('Application');
    output.keyValue('name', app.manifest.name);
    output.keyValue('version', app.manifest.version);
    output.keyValue('basePath', app.basePath);
    output.keyValue('bin', app.manifest.bin);

    if (pluginSummary.length > 0) {
      output.section('Plugins');
      for (const plugin of pluginSummary) {
        output.keyValue(plugin.name, `${plugin.providers} provider(s)`);
      }
    }

    if (health !== undefined && health.length > 0) {
      output.section('Health');
      for (const row of health) {
        const detail = row.detail ? ` ${row.detail}` : '';
        output.keyValue(row.provider, `${row.status} (${row.latencyMs}ms)${detail}`);
      }
    }

    const configKeys = Object.keys(app.config().all());
    if (configKeys.length > 0) {
      output.section('Configuration');
      for (const key of configKeys) {
        output.keyValue(key, String(app.config().get(key)));
      }
    }

    output.line();
    output.success('info complete');
  }
}
