import { describe, expect, it } from 'vitest';
import {
  ConfigRepository,
  ConfigValidationError,
  defineConfig,
  s,
  schemaAt,
  validateSchema,
  assertSchema,
} from '@mudah-cli/config';

describe('s.string', () => {
  it('accepts strings', () => {
    const result = validateSchema(s.string(), 'hello');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('hello');
  });

  it('rejects non-strings with the actual type', () => {
    const result = validateSchema(s.string(), 42);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toEqual({ path: '', message: 'expected string, got number' });
  });

  it('enforces length bounds', () => {
    expect(validateSchema(s.string().min(3), 'ab').issues[0]?.message).toBe(
      'must be at least 3 characters',
    );
    expect(validateSchema(s.string().max(2), 'abc').issues[0]?.message).toBe(
      'must be at most 2 characters',
    );
    expect(validateSchema(s.string().min(1).max(5), 'abc').ok).toBe(true);
  });

  it('enforces a pattern', () => {
    const schema = s.string().match(/^v\d+$/);
    expect(validateSchema(schema, 'v1').ok).toBe(true);
    expect(validateSchema(schema, 'nope').ok).toBe(false);
  });
});

describe('s.enum', () => {
  it('restricts values to the allowed list', () => {
    const schema = s.enum(['dev', 'prod'] as const);
    expect(validateSchema(schema, 'dev').ok).toBe(true);
    const bad = validateSchema(schema, 'staging');
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]?.message).toBe('must be one of: dev, prod');
  });
});

describe('s.number', () => {
  it('accepts numbers and rejects strings', () => {
    expect(validateSchema(s.number(), 5).value).toBe(5);
    expect(validateSchema(s.number(), '5').issues[0]?.message).toBe(
      'expected number, got string',
    );
  });

  it('enforces ranges', () => {
    expect(validateSchema(s.number().min(1), 0).ok).toBe(false);
    expect(validateSchema(s.number().max(10), 11).ok).toBe(false);
    expect(validateSchema(s.number().min(1).max(10), 5).ok).toBe(true);
  });

  it('enforces integers', () => {
    expect(validateSchema(s.number().int(), 1.5).issues[0]?.message).toBe('must be an integer');
    expect(validateSchema(s.number().int(), 4).ok).toBe(true);
  });

  it('rejects NaN', () => {
    expect(validateSchema(s.number(), Number.NaN).ok).toBe(false);
  });
});

describe('s.boolean', () => {
  it('accepts only booleans', () => {
    expect(validateSchema(s.boolean(), false).value).toBe(false);
    expect(validateSchema(s.boolean(), 'true').ok).toBe(false);
  });
});

describe('s.array', () => {
  it('validates every item with indexed paths', () => {
    const result = validateSchema(s.array(s.number()), [1, 'x', 3]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toEqual({ path: '.1', message: 'expected number, got string' });
  });

  it('enforces item counts', () => {
    expect(validateSchema(s.array(s.string()).min(2), ['a']).ok).toBe(false);
    expect(validateSchema(s.array(s.string()).max(1), ['a', 'b']).ok).toBe(false);
    expect(validateSchema(s.array(s.string()).min(1), ['a']).ok).toBe(true);
  });

  it('rejects non-arrays', () => {
    expect(validateSchema(s.array(s.string()), 'nope').issues[0]?.message).toContain(
      'expected array',
    );
  });
});

describe('s.object', () => {
  it('reports every issue at once with dotted paths', () => {
    const schema = s.object({ name: s.string(), port: s.number() });
    const result = validateSchema(schema, { name: 1, port: 'x' });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: 'name', message: 'expected string, got number' },
      { path: 'port', message: 'expected number, got string' },
    ]);
  });

  it('reports missing required keys', () => {
    const result = validateSchema(s.object({ url: s.string() }), {});
    expect(result.issues).toEqual([{ path: 'url', message: 'is required' }]);
  });

  it('fills in defaults', () => {
    const schema = s.object({ pool: s.number().default(5), ssl: s.boolean().default(false) });
    const result = validateSchema(schema, {});
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ pool: 5, ssl: false });
  });

  it('keeps a supplied value over the default', () => {
    const result = validateSchema(s.object({ pool: s.number().default(5) }), { pool: 10 });
    expect(result.value).toEqual({ pool: 10 });
  });

  it('honors optional keys', () => {
    const schema = s.object({ note: s.string().optional() });
    expect(validateSchema(schema, {}).ok).toBe(true);
    expect(validateSchema(schema, {}).value).toEqual({});
    expect(validateSchema(schema, { note: 'hi' }).value).toEqual({ note: 'hi' });
  });

  it('passes unknown keys through by default', () => {
    const result = validateSchema(s.object({ a: s.number() }), { a: 1, b: 2 });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ a: 1, b: 2 });
  });

  it('rejects unknown keys in strict mode', () => {
    const result = validateSchema(s.object({ a: s.number() }).strict(), { a: 1, b: 2 });
    expect(result.issues).toEqual([{ path: 'b', message: 'is not a known key' }]);
  });

  it('validates nested objects with full paths', () => {
    const schema = s.object({ db: s.object({ host: s.string() }) });
    const result = validateSchema(schema, { db: { host: 1 } });
    expect(result.issues).toEqual([{ path: 'db.host', message: 'expected string, got number' }]);
  });

  it('rejects arrays where an object is expected', () => {
    expect(validateSchema(s.object({ a: s.number() }), []).ok).toBe(false);
  });

  it('accepts anything under s.any()', () => {
    expect(validateSchema(s.object({ meta: s.any() }), { meta: { x: 1 } }).ok).toBe(true);
  });

  it('stores documentation from describe()', () => {
    expect(s.string().describe('the port').describeText()).toBe('the port');
  });
});

describe('assertSchema', () => {
  it('returns the value when valid', () => {
    expect(assertSchema(s.number(), 3)).toBe(3);
  });

  it('throws a ConfigValidationError listing every issue', () => {
    expect(() =>
      assertSchema(s.object({ a: s.string(), b: s.string() }), { a: 1, b: 2 }),
    ).toThrow(ConfigValidationError);
  });

  it('formats the message with one line per issue', () => {
    try {
      assertSchema(s.object({ a: s.string(), b: s.string() }), { a: 1, b: 2 });
      expect.unreachable('should have thrown');
    } catch (error) {
      const failure = error as ConfigValidationError;
      expect(failure.issues).toHaveLength(2);
      expect(failure.message).toContain('a: expected string, got number');
      expect(failure.message).toContain('b: expected string, got number');
    }
  });
});

describe('defineConfig', () => {
  it('stays an identity function without a schema', () => {
    const config = { name: 'x' };
    expect(defineConfig(config)).toBe(config);
  });

  it('validates when given a schema', () => {
    const schema = s.object({ url: s.string(), pool: s.number().default(5) });
    const config = defineConfig(schema, { url: 'sqlite:///x.db' });
    expect(config).toEqual({ url: 'sqlite:///x.db', pool: 5 });
  });

  it('throws on a bad value when given a schema', () => {
    expect(() => defineConfig(s.object({ url: s.string() }), { url: 1 })).toThrow(
      ConfigValidationError,
    );
  });
});

describe('schemaAt', () => {
  it('walks a dotted path on an object schema', () => {
    const schema = s.object({ app: s.object({ port: s.number() }) });
    expect(schemaAt(schema, '')).toBe(schema);
    expect(schemaAt(schema, 'app.port')?.type).toBe('number');
    expect(schemaAt(schema, 'app.missing')).toBeUndefined();
    expect(schemaAt(schema, 'nope')).toBeUndefined();
  });
});

describe('ConfigRepository.validate', () => {
  const schema = s.object({ host: s.string(), pool: s.number().default(5) });

  it('validates a subtree with paths rooted at the key', () => {
    const config = new ConfigRepository();
    config.set('db.host', 'localhost');
    const result = config.validate('db', schema);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ host: 'localhost', pool: 5 });
  });

  it('reports a failing subtree with the dotted path', () => {
    const config = new ConfigRepository();
    config.set('db.pool', 'many');
    const result = config.validate('db', schema);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      { path: 'db.host', message: 'is required' },
      { path: 'db.pool', message: 'expected number, got string' },
    ]);
  });

  it('validates the whole tree with an empty key', () => {
    const config = new ConfigRepository();
    config.set('name', 1);
    const result = config.validate('', s.object({ name: s.string() }));
    expect(result.issues).toEqual([{ path: 'name', message: 'expected string, got number' }]);
  });

  it('bindSchema exposes the schema and schemaAt lookup', () => {
    const config = new ConfigRepository();
    const schema = s.object({ app: s.object({ port: s.number() }) });
    config.bindSchema(schema);
    expect(config.schema).toBe(schema);
    expect(config.schemaAt('app.port')?.type).toBe('number');
    expect(config.schemaAt('nope')).toBeUndefined();
  });
});
