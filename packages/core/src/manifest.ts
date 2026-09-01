import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MudahUiOptions {
  /** Theme name (default `sleek`) or `auto` for dark/light detection. */
  theme?: string;
  /** Force reduced-motion rendering regardless of terminal detection. */
  reducedMotion?: boolean;
  /** Force color on (or off) regardless of TTY detection. */
  color?: boolean;
}

export interface MudahManifest {
  /** Application name (shown in help headers and notifications). */
  name: string;
  /** Application version (semver). */
  version: string;
  /** Binary name (`bin/<name>` in the published package). */
  bin: string;
  description?: string;
  ui?: MudahUiOptions;
  /** Set false to disable the update nudge. Default true. */
  updates?: boolean;
  /** Extra command file paths (relative to the app root) beyond src/commands. */
  commands?: string[];
  /** Extra provider file paths (relative to the app root) beyond src/providers. */
  providers?: string[];
  /** Opt in to boot/perf telemetry (disabled by default). */
  telemetry?: boolean;
}

export class MudahManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MudahManifestError';
  }
}

/** Read and validate `mudah.json` from the application root. */
export function loadManifest(basePath: string): MudahManifest {
  const file = join(basePath, 'mudah.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new MudahManifestError(
      `No valid manifest at ${file} (${reason}). Scaffold an app with \`npm create @mudah-cli/mudah\` or add a mudah.json with "name", "version", and "bin".`,
    );
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new MudahManifestError('mudah.json must contain a JSON object.');
  }

  const data = raw as Record<string, unknown>;
  const rawName = data.name;
  const rawVersion = data.version;
  const rawBin = data.bin;
  if (typeof rawName !== 'string' || rawName.length === 0) {
    throw new MudahManifestError('mudah.json field "name" must be a non-empty string.');
  }
  if (typeof rawVersion !== 'string' || rawVersion.length === 0) {
    throw new MudahManifestError('mudah.json field "version" must be a non-empty string.');
  }
  if (typeof rawBin !== 'string' || rawBin.length === 0) {
    throw new MudahManifestError('mudah.json field "bin" must be a non-empty string.');
  }

  const manifest: MudahManifest = { name: rawName, version: rawVersion, bin: rawBin };
  if (typeof data.description === 'string') manifest.description = data.description;
  if (typeof data.updates === 'boolean') manifest.updates = data.updates;
  if (data.ui && typeof data.ui === 'object') manifest.ui = data.ui as MudahUiOptions;
  if (Array.isArray(data.commands)) manifest.commands = data.commands.filter((c): c is string => typeof c === 'string');
  if (Array.isArray(data.providers)) manifest.providers = data.providers.filter((p): p is string => typeof p === 'string');
  if (data.telemetry === true) manifest.telemetry = true;
  return manifest;
}
