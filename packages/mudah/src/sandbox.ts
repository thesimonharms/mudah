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
  'NODE_PATH',
  'NODE_OPTIONS',
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

/**
 * Namespace-lite sandbox: chdir into `cwd`, allowlist env, block fetch.
 * Always call `restore()` (including on throw).
 */
export function enterSandbox(options: SandboxOptions): SandboxSession {
  const previousCwd = process.cwd();
  const previousEnv = { ...process.env };
  const previousFetch = globalThis.fetch;

  process.chdir(options.cwd);
  process.env['MUDAH_SANDBOX'] = '1';
  process.env['MUDAH_NO_FETCH'] = '1';

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MUDAH_') || key.startsWith('npm_') || ALLOWED_ENV.has(key)) continue;
    delete process.env[key];
  }
  if (options.env) Object.assign(process.env, options.env);

  globalThis.fetch = options.fetchImpl ?? (async () => {
    throw new Error('[sandbox] network is disabled (MUDAH_NO_FETCH=1)');
  });

  return {
    cwd: options.cwd,
    previousCwd,
    restore() {
      process.chdir(previousCwd);
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, previousEnv);
      globalThis.fetch = previousFetch;
    },
  };
}

/** Run `fn` inside a sandbox and always restore process cwd/env/fetch. */
export async function withSandbox<T>(options: SandboxOptions, fn: () => Promise<T> | T): Promise<T> {
  const session = enterSandbox(options);
  try {
    return await fn();
  } finally {
    session.restore();
  }
}
