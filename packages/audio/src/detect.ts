import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AudioDetection, SpawnTool } from './types.js';

const requireFromHere = createRequire(fileURLToPath(import.meta.url));

const SPAWN_TOOLS: readonly SpawnTool[] = ['pw-play', 'paplay', 'aplay'];

export function silentRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env['MUDAH_NO_AUDIO'] === '1') return true;
  const ci = env['CI'];
  return ci !== undefined && ci !== '' && ci !== 'false';
}

export function canResolveAudify(): boolean {
  try {
    requireFromHere.resolve('audify');
    return true;
  } catch {
    return false;
  }
}

export function pathDirsFrom(env: NodeJS.ProcessEnv = process.env, override?: readonly string[]): readonly string[] {
  if (override !== undefined) return override;
  return (env['PATH'] ?? '').split(':').filter(Boolean);
}

export function findSpawnTool(dirs: readonly string[] = pathDirsFrom()): SpawnTool | undefined {
  for (const tool of SPAWN_TOOLS) {
    for (const dir of dirs) {
      if (existsSync(join(dir, tool))) return tool;
    }
  }
  return undefined;
}

/**
 * Probe what `AudioOut.open({ backend: 'auto' })` would pick, without opening a stream.
 * Native is "audify is resolvable", not "the addon loaded".
 */
export function detectAudio(
  env: NodeJS.ProcessEnv = process.env,
  pathDirs?: readonly string[],
): AudioDetection {
  const spawnTool = findSpawnTool(pathDirsFrom(env, pathDirs));
  const native = canResolveAudify();

  if (silentRequested(env)) {
    return { backend: 'silent', native, spawnTool };
  }
  if (native) return { backend: 'native', native, spawnTool };
  if (spawnTool !== undefined) return { backend: 'spawn', native, spawnTool };
  return { backend: 'silent', native, spawnTool };
}
