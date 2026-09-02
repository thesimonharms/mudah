import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as typeof import('node:child_process');

const ALLOWED_ENV = new Set([
  'PATH',
  'HOME',
  'USER',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'CI',
  'NODE_ENV',
  'VITEST',
  'INIT_CWD',
]);

export interface SandboxOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface SandboxSession {
  cwd: string;
  previousCwd: string;
  restore(): void;
}

function blocked(): never {
  throw new Error('[sandbox] network is disabled (MUDAH_NO_FETCH=1)');
}

function hasUnshare(): boolean {
  try {
    const result = spawnSync('unshare', ['--user', '--net', '--map-root-user', 'true'], {
      timeout: 2000,
      encoding: 'utf8',
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Isolated sandbox: temp cwd, allowlist env (no NODE_OPTIONS), block
 * fetch/http/https/net, and wrap child spawns in `unshare --net` on Linux
 * when user namespaces are available.
 */
export function enterSandbox(options: SandboxOptions): SandboxSession {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;
  const previousHttpRequest = http.request;
  const previousHttpsRequest = https.request;
  const previousNetConnect = net.connect;
  const previousNetCreate = net.createConnection;
  const previousSpawn = childProcess.spawn;
  const wrapChildren = process.platform === 'linux' && hasUnshare();

  process.chdir(options.cwd);
  process.env['MUDAH_SANDBOX'] = '1';
  process.env['MUDAH_NO_FETCH'] = '1';

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MUDAH_') || key.startsWith('npm_') || ALLOWED_ENV.has(key)) continue;
    delete process.env[key];
  }
  if (options.env) Object.assign(process.env, options.env);
  delete process.env['NODE_OPTIONS'];
  delete process.env['NODE_PATH'];

  globalThis.fetch = options.fetchImpl ?? (async () => blocked());
  http.request = ((..._args: unknown[]) => blocked()) as typeof http.request;
  https.request = ((..._args: unknown[]) => blocked()) as typeof https.request;
  net.connect = ((..._args: unknown[]) => blocked()) as typeof net.connect;
  net.createConnection = ((..._args: unknown[]) => blocked()) as typeof net.createConnection;

  if (wrapChildren) {
    childProcess.spawn = ((command: string, args?: unknown, opts?: unknown) => {
      const argv = Array.isArray(args) ? args : [];
      const options = Array.isArray(args) ? opts : args;
      return previousSpawn('unshare', ['--user', '--net', '--map-root-user', '--', command, ...argv], options as never);
    }) as typeof childProcess.spawn;
  }

  return {
    cwd: options.cwd,
    previousCwd,
    restore() {
      process.chdir(previousCwd);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previousEnv);
      globalThis.fetch = previousFetch;
      http.request = previousHttpRequest;
      https.request = previousHttpsRequest;
      net.connect = previousNetConnect;
      net.createConnection = previousNetCreate;
      childProcess.spawn = previousSpawn;
    },
  };
}

/** Run `fn` inside a sandbox and always restore process cwd/env/network. */
export async function withSandbox<T>(options: SandboxOptions, fn: () => Promise<T> | T): Promise<T> {
  const session = enterSandbox(options);
  try {
    return await fn();
  } finally {
    session.restore();
  }
}
