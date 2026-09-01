import { Command } from '@mudah-cli/console';
import { formatGraph, pluginGraph, type PluginInfo } from '@mudah-cli/core';

/**
 * Built-in `graph` — render the plugin/provider DAG as ASCII or DOT.
 */
export default class GraphCommand extends Command {
  signature = 'graph [--format=ascii]';
  description = 'Render the provider dependency graph';

  async handle() {
    const format = String(this.option('format') ?? 'ascii');
    if (format !== 'ascii' && format !== 'dot') {
      throw this.usageError(`Unknown graph format "${format}".`, 'Use ascii or dot.');
    }
    const plugins = (typeof this.app.plugins === 'function' ? this.app.plugins() : []) as PluginInfo[];
    const extra = typeof this.app.providerNames === 'function' ? this.app.providerNames() : [];
    const graph = pluginGraph(plugins, extra);
    this.output.raw(formatGraph(graph, format));
  }
}
