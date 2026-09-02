import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const require = createRequire(import.meta.url);
const childProcess = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');

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

function assertInsideCwd(root: string, target: unknown): void {
  const raw = typeof target === 'string' ? target : String(target);
  const resolved = resolve(root, raw);
  const rel = relative(resolve(root), resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`[sandbox] write outside cwd blocked: ${raw}`);
  }
}

function wrapFsWrites(root: string): () => void {
  const previous = {
    writeFileSync: fs.writeFileSync,
    appendFileSync: fs.appendFileSync,
    mkdirSync: fs.mkdirSync,
    unlinkSync: fs.unlinkSync,
    rmSync: fs.rmSync,
    renameSync: fs.renameSync,
    copyFileSync: fs.copyFileSync,
    promisesWrite: fs.promises.writeFile.bind(fs.promises),
    promisesMkdir: fs.promises.mkdir.bind(fs.promises),
    promisesRm: fs.promises.rm.bind(fs.promises),
  };
  const guard =
    (fn: (...args: never[]) => unknown) =>
    (target: unknown, ...rest: unknown[]) => {
      assertInsideCwd(root, target);
      return (fn as (target: unknown, ...rest: unknown[]) => unknown)(target, ...rest);
    };
  (fs as { writeFileSync: typeof fs.writeFileSync }).writeFileSync = guard(previous.writeFileSync) as typeof fs.writeFileSync;
  (fs as { appendFileSync: typeof fs.appendFileSync }).appendFileSync = guard(previous.appendFileSync) as typeof fs.appendFileSync;
  (fs as { mkdirSync: typeof fs.mkdirSync }).mkdirSync = guard(previous.mkdirSync) as typeof fs.mkdirSync;
  (fs as { unlinkSync: typeof fs.unlinkSync }).unlinkSync = guard(previous.unlinkSync) as typeof fs.unlinkSync;
  (fs as { rmSync: typeof fs.rmSync }).rmSync = guard(previous.rmSync) as typeof fs.rmSync;
  (fs as { renameSync: typeof fs.renameSync }).renameSync = ((from: unknown, to: unknown, ...rest: unknown[]) => {
    assertInsideCwd(root, from);
    assertInsideCwd(root, to);
    return (previous.renameSync as (...args: unknown[]) => unknown)(from, to, ...rest);
  }) as typeof fs.renameSync;
  (fs as { copyFileSync: typeof fs.copyFileSync }).copyFileSync = ((from: unknown, to: unknown, ...rest: unknown[]) => {
    assertInsideCwd(root, from);
    assertInsideCwd(root, to);
    return (previous.copyFileSync as (...args: unknown[]) => unknown)(from, to, ...rest);
  }) as typeof fs.copyFileSync;
  fs.promises.writeFile = ((target: unknown, ...rest: unknown[]) => {
    assertInsideCwd(root, target);
    return (previous.promisesWrite as (...args: unknown[]) => Promise<void>)(target, ...rest);
  }) as typeof fs.promises.writeFile;
  fs.promises.mkdir = ((target: unknown, ...rest: unknown[]) => {
    assertInsideCwd(root, target);
    return (previous.promisesMkdir as (...args: unknown[]) => Promise<string | undefined>)(target, ...rest);
  }) as typeof fs.promises.mkdir;
  fs.promises.rm = ((target: unknown, ...rest: unknown[]) => {
    assertInsideCwd(root, target);
    return (previous.promisesRm as (...args: unknown[]) => Promise<void>)(target, ...rest);
  }) as typeof fs.promises.rm;
  return () => {
    fs.writeFileSync = previous.writeFileSync;
    fs.appendFileSync = previous.appendFileSync;
    fs.mkdirSync = previous.mkdirSync;
    fs.unlinkSync = previous.unlinkSync;
    fs.rmSync = previous.rmSync;
    fs.renameSync = previous.renameSync;
    fs.copyFileSync = previous.copyFileSync;
    fs.promises.writeFile = previous.promisesWrite;
    fs.promises.mkdir = previous.promisesMkdir;
    fs.promises.rm = previous.promisesRm;
  };
}

function unshareArgs(command: string, argv: string[]): string[] {
  return ['--user', '--net', '--map-root-user', '--', command, ...argv];
}

/**
 * Isolated sandbox: temp cwd, allowlist env (no NODE_OPTIONS), block
 * fetch/http/https/net, reject writes outside cwd, and wrap child spawns
 * (including spawnSync) in `unshare --net` on Linux when user namespaces
 * are available.
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
  const previousSpawnSync = childProcess.spawnSync;
  const previousExec = childProcess.exec;
  const previousExecSync = childProcess.execSync;
  const wrapChildren = process.platform === 'linux' && hasUnshare();
  const restoreFs = wrapFsWrites(options.cwd);

  process.chdir(options.cwd);
  process.env['MUDAH_SANDBOX'] = '1';
  process.env['MUDAH_NO_FETCH'] = '1';
  process.env['TMPDIR'] = options.cwd;
  process.env['TMP'] = options.cwd;
  process.env['TEMP'] = options.cwd;

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
      const argv = Array.isArray(args) ? (args as string[]) : [];
      const spawnOpts = Array.isArray(args) ? opts : args;
      return previousSpawn('unshare', unshareArgs(command, argv), spawnOpts as never);
    }) as typeof childProcess.spawn;
    childProcess.spawnSync = ((command: string, args?: unknown, opts?: unknown) => {
      const argv = Array.isArray(args) ? (args as string[]) : [];
      const spawnOpts = Array.isArray(args) ? opts : args;
      return previousSpawnSync('unshare', unshareArgs(command, argv), spawnOpts as never);
    }) as typeof childProcess.spawnSync;
    childProcess.exec = ((command: string, options?: unknown, callback?: unknown) => {
      const wrapped = `unshare --user --net --map-root-user -- ${command}`;
      return previousExec(wrapped, options as never, callback as never);
    }) as typeof childProcess.exec;
    childProcess.execSync = ((command: string, options?: unknown) => {
      const wrapped = `unshare --user --net --map-root-user -- ${command}`;
      return previousExecSync(wrapped, options as never);
    }) as typeof childProcess.execSync;
  }

  return {
    cwd: options.cwd,
    previousCwd,
    restore() {
      restoreFs();
      process.chdir(previousCwd);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previousEnv);
      globalThis.fetch = previousFetch;
      http.request = previousHttpRequest;
      https.request = previousHttpsRequest;
      net.connect = previousNetConnect;
      net.createConnection = previousNetCreate;
      childProcess.spawn = previousSpawn;
      childProcess.spawnSync = previousSpawnSync;
      childProcess.exec = previousExec;
      childProcess.execSync = previousExecSync;
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

const STAGE_NAMES = ['mudah.json', 'src', 'bin', 'config', 'package.json'] as const;

/**
 * Copy the app files a sandboxed command needs into `to`. Skips missing
 * names. Does not copy `node_modules`.
 */
export function stageSandboxTree(from: string, to: string): string[] {
  const copied: string[] = [];
  for (const name of STAGE_NAMES) {
    const src = join(from, name);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, join(to, name), { recursive: true });
    copied.push(name);
  }
  return copied;
}
