import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from '@mudah-cli/console';
import { defaultCacheDir, t } from '@mudah-cli/core';

/**
 * Built-in `cache` — list or clear `.mudah/cache/` and mention the
 * update-check cache directory from {@link defaultCacheDir}.
 */
export default class CacheCommand extends Command {
  signature = 'cache {action=ls}';
  description = 'List or clear the local Mudah cache';

  async handle() {
    const action = String(this.arg('action') ?? 'ls');
    if (action !== 'ls' && action !== 'clear') {
      throw this.usageError(`Unknown cache action "${action}".`, 'Use ls or clear.');
    }

    const appCache = join(this.app.basePath, '.mudah', 'cache');
    const updateCache = defaultCacheDir();

    if (action === 'clear') {
      rmSync(appCache, { recursive: true, force: true });
      mkdirSync(appCache, { recursive: true });
      this.output.success(`Cleared ${appCache}`);
      return;
    }

    this.output.section('Cache');
    this.output.keyValue('app', appCache);
    this.output.keyValue('updates', updateCache);
    const entries = listDir(appCache);
    if (entries.length === 0) {
      this.output.info(t('cache.empty'));
      return;
    }
    for (const name of entries) {
      this.output.bullet(name);
    }
  }
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}
