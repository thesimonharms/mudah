import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ConfigRepository,
  defineConfig,
  env,
  formatPrecedence,
  loadConfigFiles,
  loadEnvFile,
} from '@mudah-cli/config';

describe('ConfigRepository', () => {
  it('reads and writes dotted keys through nested structure', () => {
    const config = new ConfigRepository();
    config.set('app.name', 'my-cli');
    config.set('app.env.staging', true);
    expect(config.get('app.name')).toBe('my-cli');
    expect(config.get('app.env.staging')).toBe(true);
    expect(config.get('missing.key', 'fallback')).toBe('fallback');
    expect(config.has('app.name')).toBe(true);
    expect(config.has('app.nope')).toBe(false);
  });

  it('merge() fills in defaults without overriding existing values', () => {
    const config = new ConfigRepository();
    config.merge('app', { name: 'default', port: 3000, nested: { a: 1, b: 2 } });
    config.set('app.name', 'mine');
    config.set('app.nested.a', 10);
    config.merge('app', { name: 'default', port: 3000, nested: { a: 1, c: 3 } });

    expect(config.get('app.name')).toBe('mine');
    expect(config.get('app.port')).toBe(3000);
    expect(config.get('app.nested.a')).toBe(10);
    expect(config.get('app.nested.b')).toBe(2);
    expect(config.get('app.nested.c')).toBe(3);
  });

  it('delete() removes dotted keys', () => {
    const config = new ConfigRepository();
    config.set('a.b.c', 1);
    expect(config.delete('a.b.c')).toBe(true);
    expect(config.has('a.b.c')).toBe(false);
    expect(config.delete('a.b.c')).toBe(false);
  });

  it('all() exposes the full tree', () => {
    const config = new ConfigRepository();
    config.set('x', [1, 2]);
    expect(config.all()).toEqual({ x: [1, 2] });
  });

  it('records provenance per dotted key and layer', () => {
    const config = new ConfigRepository();
    config.merge('app', { name: 'default', port: 3000 }, 'default');
    config.set('app.name', 'mudah', 'file');
    config.set('app.env', 'prod', 'env');

    expect(config.source('app.name')).toEqual({ layer: 'file', value: 'mudah' });
    expect(config.source('app.port')).toEqual({ layer: 'default', value: 3000 });
    expect(config.source('app.env')).toEqual({ layer: 'env', value: 'prod' });
    expect(config.source('missing')).toBeUndefined();

    const rows = config.precedence();
    expect(rows).toEqual([
      { key: 'app.env', layer: 'env', value: 'prod' },
      { key: 'app.name', layer: 'file', value: 'mudah' },
      { key: 'app.port', layer: 'default', value: 3000 },
    ]);
    expect(formatPrecedence(rows)).toEqual([
      'app.env  env  prod',
      'app.name  file  mudah',
      'app.port  default  3000',
    ]);
  });

  it('set() defaults to the runtime layer', () => {
    const config = new ConfigRepository();
    config.set('flag', true);
    expect(config.source('flag')).toEqual({ layer: 'runtime', value: true });
  });

  it('merge() keeps existing values and their layers', () => {
    const config = new ConfigRepository();
    config.set('app.name', 'mine', 'flag');
    config.merge('app', { name: 'default', port: 3000 }, 'default');
    expect(config.get('app.name')).toBe('mine');
    expect(config.source('app.name')).toEqual({ layer: 'flag', value: 'mine' });
    expect(config.source('app.port')).toEqual({ layer: 'default', value: 3000 });
  });

  it('delete() drops provenance for the key and its children', () => {
    const config = new ConfigRepository();
    config.set('app.name', 'x', 'file');
    config.set('app.port', 1, 'file');
    expect(config.delete('app')).toBe(true);
    expect(config.source('app.name')).toBeUndefined();
    expect(config.precedence()).toEqual([]);
  });

});

describe('env()', () => {
  const touched: string[] = [];

  function setEnv(key: string, value: string | undefined): void {
    if (process.env[key] !== undefined) touched.push(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  beforeEach(() => touched.length = 0);
  afterEach(() => {
    for (const key of touched) delete process.env[key];
  });

  it('parses booleans, null, numbers, and JSON', () => {
    setEnv('MUDAH_TEST_BOOL', 'true');
    setEnv('MUDAH_TEST_NULL', 'null');
    setEnv('MUDAH_TEST_NUM', '3000');
    setEnv('MUDAH_TEST_FLOAT', '-1.5');
    setEnv('MUDAH_TEST_JSON', '{"a":1}');
    setEnv('MUDAH_TEST_ARR', '[1,2]');

    expect(env('MUDAH_TEST_BOOL')).toBe(true);
    expect(env('MUDAH_TEST_NULL')).toBeNull();
    expect(env('MUDAH_TEST_NUM')).toBe(3000);
    expect(env('MUDAH_TEST_FLOAT')).toBe(-1.5);
    expect(env('MUDAH_TEST_JSON')).toEqual({ a: 1 });
    expect(env('MUDAH_TEST_ARR')).toEqual([1, 2]);
  });

  it('falls back to the default when unset', () => {
    setEnv('MUDAH_TEST_MISSING', undefined);
    expect(env('MUDAH_TEST_MISSING', 'fallback')).toBe('fallback');
    expect(env('MUDAH_TEST_MISSING')).toBeUndefined();
  });

  it('passes through plain strings', () => {
    setEnv('MUDAH_TEST_STR', 'production');
    expect(env('MUDAH_TEST_STR')).toBe('production');
  });
});

describe('loadEnvFile()', () => {
  it('returns false for a missing file and loads when present', async () => {
    expect(loadEnvFile('/definitely/not/here/.env')).toBe(false);

    const dir = await mkdtemp(join(tmpdir(), 'mudah-env-'));
    try {
      const file = join(dir, '.env');
      await writeFile(file, 'MUDAH_TEST_ENV_KEY=from-file\n');
      expect(loadEnvFile(file)).toBe(true);
      expect(process.env['MUDAH_TEST_ENV_KEY']).toBe('from-file');
      delete process.env['MUDAH_TEST_ENV_KEY'];
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('loadConfigFiles()', () => {
  it('loads sorted config files by stem', async () => {
    // Fixture dir lives inside the project root so vitest's module runner
    // can dynamically import the generated files.
    const dir = join(process.cwd(), 'test', '.fixtures', 'config');
    await rm(dir, { recursive: true, force: true });
    await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
    try {
      await writeFile(join(dir, 'db.ts'), 'export default { url: "sqlite" };');
      await writeFile(join(dir, 'app.ts'), 'export default { name: "x" };');
      const config = await loadConfigFiles(process.cwd(), { dir });
      expect(Object.keys(config)).toEqual(['app', 'db']);
      expect(config.app).toEqual({ name: 'x' });
      expect(config.db).toEqual({ url: 'sqlite' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty object when the directory is missing', async () => {
    const config = await loadConfigFiles('/definitely/not/here');
    expect(config).toEqual({});
  });
});

describe('defineConfig()', () => {
  it('is an identity function that preserves types', () => {
    const config = defineConfig({ name: 'x', port: 8080 });
    expect(config).toEqual({ name: 'x', port: 8080 });
    const typed: { name: string; port: number } = config;
    expect(typed.port).toBe(8080);
  });
});
