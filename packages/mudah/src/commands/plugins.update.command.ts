import { spawnSync } from 'node:child_process';
import { Command } from '@mudah-cli/console';
import { t, type PluginInfo } from '@mudah-cli/core';

export interface RegistryLatest {
  readonly name: string;
  readonly version: string;
}

export type PluginUpdateSpawn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; encoding: 'utf8' },
) => { status: number | null; stdout: string; stderr: string; error?: Error };

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

export function applyPluginUpdate(
  name: string,
  cwd: string,
  spawn: PluginUpdateSpawn = (command, args, options) => spawnSync(command, [...args], options),
): { ok: boolean; detail: string } {
  const result = spawn('npm', ['install', `${name}@latest`], { cwd, encoding: 'utf8' });
  if (result.error) return { ok: false, detail: result.error.message };
  if (result.status !== 0) {
    return { ok: false, detail: (result.stderr || result.stdout || `npm exit ${String(result.status)}`).trim() };
  }
  return { ok: true, detail: 'installed' };
}

/**
 * Built-in `plugins:update` — compare installed plugin versions to the npm
 * registry. `--apply` runs `npm install name@latest` for each outdated plugin.
 */
export default class PluginsUpdateCommand extends Command {
  signature = 'plugins:update [--apply]';
  description = 'Check the npm registry for plugin updates and optionally install them';

  async handle() {
    const plugins = await this.app.reloadPlugins();
    const doFetch = this.app.has('plugins.fetch') ? this.app.make<typeof fetch>('plugins.fetch') : fetch;
    const spawn: PluginUpdateSpawn = this.app.has('plugins.spawn')
      ? this.app.make<PluginUpdateSpawn>('plugins.spawn')
      : (command, args, options) => spawnSync(command, [...args], options);
    const apply = this.option('apply') === true;
    let outdated = 0;
    let failed = 0;

    this.output.section('Plugins');
    for (const plugin of plugins as PluginInfo[]) {
      const latest = await fetchLatestVersion(plugin.name, doFetch);
      const current = plugin.version ?? 'unknown';
      if (latest !== undefined && current !== 'unknown' && latest !== current) {
        this.output.warn(`${plugin.name}  ${current} → ${latest}`);
        outdated += 1;
        if (apply) {
          const result = applyPluginUpdate(plugin.name, this.app.basePath, spawn);
          if (result.ok) this.output.success(`${plugin.name} installed ${latest}`);
          else {
            this.output.error(`${plugin.name}  ${result.detail}`);
            failed += 1;
          }
        }
      } else {
        this.output.keyValue(plugin.name, latest ?? current);
      }
    }

    if (outdated === 0) this.output.success(t('plugins.upToDate'));
    else if (!apply) this.output.warn(`${outdated} plugin(s) have a newer version on npm. Pass --apply to install.`);
    this.output.keyValue('plugins', String(plugins.length));
    for (const warning of this.app.pluginWarnings()) {
      this.output.warn(warning);
    }
    return failed > 0 ? 1 : 0;
  }
}
