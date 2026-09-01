import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ResolveWgslOptions {
  /** File reader for included paths (default `readFileSync`). */
  readFile?: (path: string) => string;
  /** Directory that relative includes resolve against. Default `process.cwd()`. */
  baseDir?: string;
}

const INCLUDE =
  /^[ \t]*(?:#include\s+["'<]([^"'>]+)["'>]|\/\/\s*@import\s+["']?([^\s"']+)["']?|@import\s+["']?([^\s"']+)["']?)\s*$/;

/**
 * Expand `#include "foo.wgsl"` and `// @import foo` (or `@import foo`)
 * directives. Detects include cycles.
 */
export function resolveWgsl(source: string, options: ResolveWgslOptions = {}): string {
  const readFile = options.readFile ?? defaultRead;
  const baseDir = options.baseDir ?? process.cwd();
  return expand(source, baseDir, [], readFile, '<source>');
}

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
}

function parseInclude(line: string): string | undefined {
  const match = INCLUDE.exec(line);
  if (match === null) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

function withExtension(spec: string): string {
  return spec.endsWith('.wgsl') ? spec : `${spec}.wgsl`;
}

function expand(
  source: string,
  baseDir: string,
  stack: readonly string[],
  readFile: (path: string) => string,
  current: string,
): string {
  if (stack.includes(current)) {
    throw new Error(`[vgpu] Circular WGSL include: ${[...stack, current].join(' -> ')}`);
  }
  const nextStack = [...stack, current];
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const spec = parseInclude(line);
    if (spec === undefined) {
      out.push(line);
      continue;
    }
    const resolved = join(baseDir, withExtension(spec));
    let body: string;
    try {
      body = readFile(resolved);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`[vgpu] Cannot read WGSL include "${resolved}" (${reason}).`);
    }
    out.push(expand(body, dirname(resolved), nextStack, readFile, resolved));
  }
  return out.join('\n');
}
