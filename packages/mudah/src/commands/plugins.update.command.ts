import { Command } from '@mudah-cli/console';
import { t, type PluginInfo } from '@mudah-cli/core';

export interface RegistryLatest {
  readonly name: string;
  readonly version: string;
}

export async function fetchLatestVersion(
  name: string,
  doFetch: typeof fetch = fetch,
): Promise<string | undefined> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`;
  try {
    const response = await doFetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' ? body.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Built-in `plugins:update` — compare installed plugin versions to the npm
 * registry, then re-scan local plugins.
 */
export default class PluginsUpdateCommand extends Command {
  signature = 'plugins:update';
  description = 'Check the npm registry for plugin updates and re-scan';

  async handle() {
    const plugins = await this.app.reloadPlugins();
    const doFetch = this.app.has('plugins.fetch') ? this.app.make<typeof fetch>('plugins.fetch') : fetch;
    let outdated = 0;

    this.output.section('Plugins');
    for (const plugin of plugins as PluginInfo[]) {
      const latest = await fetchLatestVersion(plugin.name, doFetch);
      const current = plugin.version ?? 'unknown';
      if (latest !== undefined && current !== 'unknown' && latest !== current) {
        this.output.warn(`${plugin.name}  ${current} → ${latest}`);
        outdated += 1;
      } else {
        this.output.keyValue(plugin.name, latest ?? current);
      }
    }

    if (outdated === 0) this.output.success(t('plugins.upToDate'));
    else this.output.warn(`${outdated} plugin(s) have a newer version on npm.`);
    this.output.keyValue('plugins', String(plugins.length));
    for (const warning of this.app.pluginWarnings()) {
      this.output.warn(warning);
    }
  }
}
