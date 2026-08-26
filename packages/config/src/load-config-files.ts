import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface LoadConfigOptions {
  /** Directory to load from (relative to `basePath` or absolute). Default `config`. */
  dir?: string;
}

/**
 * Load every `config/*.ts|js` file (sorted for determinism) and return a map
 * of `{ file-stem: default-export }`. A missing directory yields `{}`.
 *
 * Works on both Node (native TypeScript) and Bun.
 */
export async function loadConfigFiles(
  basePath: string,
  options: LoadConfigOptions = {},
): Promise<Record<string, unknown>> {
  const dir = options.dir ?? 'config';
  const absolute = isAbsolute(dir) ? dir : join(basePath, dir);

  let entries: Dirent<string>[];
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return {};
  }

  const files = entries
    .filter((entry) => entry.isFile() && /\.(ts|mts|js|mjs)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const result: Record<string, unknown> = {};
  for (const file of files) {
    const name = file.replace(/\.(ts|mts|js|mjs)$/, '');
    try {
      const mod = await import(pathToFileURL(join(absolute, file)).href);
      const value = mod.default ?? mod;
      if (value && typeof value === 'object') {
        result[name] = value;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[config] Failed to load ${file}: ${message}`);
    }
  }
  return result;
}
