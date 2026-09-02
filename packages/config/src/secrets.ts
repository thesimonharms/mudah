import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isPlainObject } from './paths.js';
import { redactSecrets } from './redact.js';

/** A backend that can store and retrieve named secrets. */
export interface SecretDriver {
  readonly name: string;
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): boolean;
  list(): string[];
}

export interface SecretStoreOptions {
  /** Drivers consulted in order. `get` is first-win. */
  drivers: SecretDriver[];
}

export interface ResolveSecretOptions {
  /** Env map used by `env:` refs (default `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Directory (or JSON file) used by `file:` refs. */
  fileDir?: string;
  /** Options forwarded to the keyring driver for `keyring:` refs. */
  keyring?: KeyringDriverOptions;
}

export type KeyringSpawnResult = {
  status: number;
  stdout: string;
};

/**
 * Injected process runner for the OS keyring. Return `null` when the
 * command is not available (tests, missing tools).
 */
export type KeyringSpawn = (
  command: string,
  args: readonly string[],
  options?: { input?: string },
) => KeyringSpawnResult | null;

export interface KeyringDriverOptions {
  /** Process runner (tests inject a stub). */
  spawn?: KeyringSpawn;
  /** Home directory for the file fallback. Default `os.homedir()`. */
  home?: string;
  /** Platform used to pick `security` vs `secret-tool`. */
  platform?: NodeJS.Platform;
  /** Exact fallback file path. Default `~/.mudah/keyring.json`. */
  filePath?: string;
}

const ENV_PREFIX = 'MUDAH_SECRET_';

function readJsonObject(file: string): Record<string, string> {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!isPlainObject(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeJsonObject(file: string, data: Record<string, string>): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  // mode on writeFileSync is ignored when the file already exists.
  chmodSync(file, 0o600);
}

function defaultSecretsDir(): string {
  return join(homedir(), '.mudah', 'secrets');
}

function secretsFile(dir: string): string {
  return dir.endsWith('.json') ? dir : join(dir, 'secrets.json');
}

/**
 * Read secrets from the environment. `get('FOO')` looks at
 * `MUDAH_SECRET_FOO`, then `process.env.FOO`.
 */
export function envSecretDriver(env: NodeJS.ProcessEnv = process.env): SecretDriver {
  return {
    name: 'env',
    get(name: string): string | undefined {
      const prefixed = env[`${ENV_PREFIX}${name}`];
      if (prefixed !== undefined) return prefixed;
      const upper = env[`${ENV_PREFIX}${name.toUpperCase()}`];
      if (upper !== undefined) return upper;
      return env[name];
    },
    set(name: string, value: string): void {
      env[`${ENV_PREFIX}${name}`] = value;
    },
    delete(name: string): boolean {
      const keys = [`${ENV_PREFIX}${name}`, `${ENV_PREFIX}${name.toUpperCase()}`, name];
      let removed = false;
      for (const key of keys) {
        if (env[key] !== undefined) {
          delete env[key];
          removed = true;
        }
      }
      return removed;
    },
    list(): string[] {
      const names: string[] = [];
      for (const key of Object.keys(env)) {
        if (key.startsWith(ENV_PREFIX)) names.push(key.slice(ENV_PREFIX.length));
      }
      return names;
    },
  };
}

/**
 * Persist secrets as a JSON object. `dir` is a directory (`secrets.json`
 * inside it) or a `.json` file path.
 */
export function fileSecretDriver(dir: string): SecretDriver {
  const file = secretsFile(dir);
  return {
    name: 'file',
    get(name: string): string | undefined {
      return readJsonObject(file)[name];
    },
    set(name: string, value: string): void {
      const data = readJsonObject(file);
      data[name] = value;
      writeJsonObject(file, data);
    },
    delete(name: string): boolean {
      const data = readJsonObject(file);
      if (!(name in data)) return false;
      delete data[name];
      writeJsonObject(file, data);
      return true;
    },
    list(): string[] {
      return Object.keys(readJsonObject(file));
    },
  };
}

function defaultKeyringSpawn(
  command: string,
  args: readonly string[],
  options: { input?: string } = {},
): KeyringSpawnResult | null {
  try {
    const result = spawnSync(command, [...args], {
      encoding: 'utf8',
      input: options.input,
      timeout: 3000,
    });
    if (result.error) return null;
    return { status: result.status ?? 1, stdout: result.stdout ?? '' };
  } catch {
    return null;
  }
}

function toolAvailable(spawn: KeyringSpawn, command: string): boolean {
  return spawn(command, ['--version']) !== null;
}

function fallbackKeyringFile(options: KeyringDriverOptions): string {
  if (options.filePath !== undefined && options.filePath.length > 0) return options.filePath;
  const home = options.home ?? homedir();
  return join(home, '.mudah', 'keyring.json');
}

type KeyringBackend = 'secret-tool' | 'security' | 'file';

function pickBackend(spawn: KeyringSpawn, platform: NodeJS.Platform): KeyringBackend {
  const order: KeyringBackend[] =
    platform === 'darwin' ? ['security', 'secret-tool'] : ['secret-tool', 'security'];
  for (const command of order) {
    if (toolAvailable(spawn, command)) return command;
  }
  return 'file';
}

/**
 * Best-effort OS keyring. Tries `secret-tool` (libsecret) or `security`
 * (macOS) via an injectable spawn. When neither tool is available, secrets
 * live in `~/.mudah/keyring.json`.
 */
export function keyringSecretDriver(options: KeyringDriverOptions = {}): SecretDriver {
  const spawn = options.spawn ?? defaultKeyringSpawn;
  const platform = options.platform ?? process.platform;
  const fileDriver = fileSecretDriver(fallbackKeyringFile(options));
  let backend: KeyringBackend | undefined;

  const resolve = (): KeyringBackend => {
    if (backend === undefined) backend = pickBackend(spawn, platform);
    return backend;
  };

  return {
    name: 'keyring',
    get(name: string): string | undefined {
      const kind = resolve();
      if (kind === 'file') return fileDriver.get(name);
      if (kind === 'secret-tool') {
        const result = spawn('secret-tool', ['lookup', 'service', 'mudah', 'key', name]);
        if (result === null || result.status !== 0) return undefined;
        const value = result.stdout.replace(/\n$/, '');
        return value.length > 0 ? value : undefined;
      }
      const result = spawn('security', [
        'find-generic-password',
        '-s',
        'mudah',
        '-a',
        name,
        '-w',
      ]);
      if (result === null || result.status !== 0) return undefined;
      const value = result.stdout.replace(/\n$/, '');
      return value.length > 0 ? value : undefined;
    },
    set(name: string, value: string): void {
      const kind = resolve();
      if (kind === 'file') {
        fileDriver.set(name, value);
        return;
      }
      if (kind === 'secret-tool') {
        const result = spawn(
          'secret-tool',
          ['store', '--label', `mudah:${name}`, 'service', 'mudah', 'key', name],
          { input: value },
        );
        if (result === null || result.status !== 0) fileDriver.set(name, value);
        return;
      }
      // macOS `security -w` puts the secret on argv (visible in `ps`).
      // Writes go to the 0600 file backend instead.
      fileDriver.set(name, value);
    },
    delete(name: string): boolean {
      const kind = resolve();
      if (kind === 'file') return fileDriver.delete(name);
      if (kind === 'secret-tool') {
        const result = spawn('secret-tool', ['clear', 'service', 'mudah', 'key', name]);
        const fileRemoved = fileDriver.delete(name);
        return (result !== null && result.status === 0) || fileRemoved;
      }
      const result = spawn('security', [
        'delete-generic-password',
        '-s',
        'mudah',
        '-a',
        name,
      ]);
      const fileRemoved = fileDriver.delete(name);
      return (result !== null && result.status === 0) || fileRemoved;
    },
    list(): string[] {
      // OS keyrings don't give us a cheap name listing; the file fallback
      // (and any secrets we spilled there) is the authoritative index.
      return fileDriver.list();
    },
  };
}

/**
 * First-win secret store. `get` returns the first driver that has the name;
 * `set` writes to the first driver; `delete` removes the name from every
 * driver so a later one can't resurrect it.
 */
export class SecretStore {
  private readonly drivers: readonly SecretDriver[];

  constructor(options: SecretStoreOptions) {
    this.drivers = options.drivers;
  }

  get(name: string): string | undefined {
    for (const driver of this.drivers) {
      const value = driver.get(name);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  set(name: string, value: string): void {
    const driver = this.drivers[0];
    driver?.set(name, value);
  }

  delete(name: string): boolean {
    let removed = false;
    for (const driver of this.drivers) {
      if (driver.delete(name)) removed = true;
    }
    return removed;
  }

  list(): string[] {
    const names = new Set<string>();
    for (const driver of this.drivers) {
      for (const name of driver.list()) names.add(name);
    }
    return [...names];
  }

  /** Redacted view of every stored secret. Safe for `dump` / debug output. */
  dump(): Record<string, unknown> {
    const raw: Record<string, unknown> = {};
    for (const name of this.list()) {
      const value = this.get(name);
      if (value !== undefined) raw[name] = value;
    }
    return redactSecrets(raw, { keys: [/.+/] }) as Record<string, unknown>;
  }

  /** Alias of {@link dump} for debug printers. */
  debug(): Record<string, unknown> {
    return this.dump();
  }
}

/** Build a {@link SecretStore} from an ordered driver list. */
export function createSecretStore(options: SecretStoreOptions): SecretStore {
  return new SecretStore(options);
}

const SECRET_REF = /^(env|file|keyring):(.+)$/;

/**
 * Resolve a secret reference (`env:FOO`, `file:token`, `keyring:api`).
 * Unknown or empty refs return `undefined`.
 */
export function resolveSecret(ref: string, options: ResolveSecretOptions = {}): string | undefined {
  const match = SECRET_REF.exec(ref);
  if (!match) return undefined;
  const kind = match[1] as 'env' | 'file' | 'keyring';
  const name = match[2] ?? '';
  if (name.length === 0) return undefined;

  if (kind === 'env') return envSecretDriver(options.env).get(name);
  if (kind === 'file') return fileSecretDriver(options.fileDir ?? defaultSecretsDir()).get(name);
  return keyringSecretDriver(options.keyring).get(name);
}
