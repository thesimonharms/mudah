import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSecretStore,
  envSecretDriver,
  fileSecretDriver,
  keyringSecretDriver,
  resolveSecret,
  type KeyringSpawn,
} from '@mudah-cli/config';

const dirs: string[] = [];

afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mudah-secrets-'));
  dirs.push(dir);
  return dir;
}

describe('envSecretDriver', () => {
  it('reads MUDAH_SECRET_<NAME> then the raw env key', () => {
    const env: NodeJS.ProcessEnv = { MUDAH_SECRET_FOO: 'prefixed', BAR: 'raw' };
    const driver = envSecretDriver(env);
    expect(driver.get('FOO')).toBe('prefixed');
    expect(driver.get('BAR')).toBe('raw');
    expect(driver.get('missing')).toBeUndefined();
  });

  it('sets and lists prefixed names', () => {
    const env: NodeJS.ProcessEnv = {};
    const driver = envSecretDriver(env);
    driver.set('TOKEN', 'abc');
    expect(env['MUDAH_SECRET_TOKEN']).toBe('abc');
    expect(driver.list()).toEqual(['TOKEN']);
    expect(driver.delete('TOKEN')).toBe(true);
    expect(driver.get('TOKEN')).toBeUndefined();
  });
});

describe('fileSecretDriver', () => {
  it('persists a JSON object of secrets', async () => {
    const dir = await tempDir();
    const driver = fileSecretDriver(dir);
    driver.set('token', 'abc');
    expect(driver.get('token')).toBe('abc');
    expect(driver.list()).toEqual(['token']);
    const raw = JSON.parse(await readFile(join(dir, 'secrets.json'), 'utf8')) as Record<
      string,
      string
    >;
    expect(raw).toEqual({ token: 'abc' });
    expect(driver.delete('token')).toBe(true);
    expect(driver.get('token')).toBeUndefined();
  });

  it('writes secrets.json with mode 0600', async () => {
    const dir = await tempDir();
    const driver = fileSecretDriver(dir);
    driver.set('token', 'abc');
    const { statSync } = await import('node:fs');
    const mode = statSync(join(dir, 'secrets.json')).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

describe('keyringSecretDriver', () => {
  it('uses injected spawn for secret-tool lookup', () => {
    const spawn: KeyringSpawn = (command, args) => {
      if (command !== 'secret-tool') return null;
      if (args[0] === 'lookup' && args.includes('api')) {
        return { status: 0, stdout: 'from-keyring\n' };
      }
      return { status: 0, stdout: '' };
    };
    const driver = keyringSecretDriver({ spawn, platform: 'linux' });
    expect(driver.get('api')).toBe('from-keyring');
  });

  it('falls back to a file when spawn is unavailable', async () => {
    const dir = await tempDir();
    const filePath = join(dir, 'keyring.json');
    const driver = keyringSecretDriver({
      spawn: () => null,
      filePath,
    });
    driver.set('api', 's3cret');
    expect(driver.get('api')).toBe('s3cret');
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, string>;
    expect(raw).toEqual({ api: 's3cret' });
  });
});

describe('createSecretStore', () => {
  it('resolves first-win across drivers', async () => {
    const dir = await tempDir();
    const file = fileSecretDriver(dir);
    file.set('API', 'from-file');
    file.set('ONLY_FILE', 'file-only');

    const store = createSecretStore({
      drivers: [envSecretDriver({ MUDAH_SECRET_API: 'from-env' }), file],
    });

    expect(store.get('API')).toBe('from-env');
    expect(store.get('ONLY_FILE')).toBe('file-only');
    expect(store.list().sort()).toEqual(['API', 'ONLY_FILE']);
  });

  it('redacts every value in dump() / debug()', async () => {
    const dir = await tempDir();
    const store = createSecretStore({ drivers: [fileSecretDriver(dir)] });
    store.set('token', 'abc');
    store.set('api', 'xyz');
    expect(store.dump()).toEqual({ token: '[redacted]', api: '[redacted]' });
    expect(store.debug()).toEqual({ token: '[redacted]', api: '[redacted]' });
  });
});

describe('resolveSecret', () => {
  it('resolves env:FOO', () => {
    expect(resolveSecret('env:FOO', { env: { MUDAH_SECRET_FOO: 'v' } })).toBe('v');
  });

  it('resolves file:token', async () => {
    const dir = await tempDir();
    fileSecretDriver(dir).set('token', 'from-file');
    expect(resolveSecret('file:token', { fileDir: dir })).toBe('from-file');
  });

  it('resolves keyring:api via inject', () => {
    const spawn: KeyringSpawn = (command, args) => {
      if (command !== 'secret-tool') return null;
      if (args[0] === 'lookup') return { status: 0, stdout: 'ring' };
      return { status: 0, stdout: '' };
    };
    expect(resolveSecret('keyring:api', { keyring: { spawn, platform: 'linux' } })).toBe(
      'ring',
    );
  });

  it('returns undefined for a bad ref', () => {
    expect(resolveSecret('nope')).toBeUndefined();
    expect(resolveSecret('env:')).toBeUndefined();
  });
});
