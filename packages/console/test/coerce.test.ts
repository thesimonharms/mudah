import { describe, expect, it } from 'vitest';
import { resolve as resolvePath } from 'node:path';
import {
  ArgumentParseError,
  coerceValue,
  parseInput,
  parseSignature,
  type CoercionType,
} from '@mudah-cli/console';

describe('coerceValue', () => {
  it('parses integers', () => {
    expect(coerceValue('42', 'int')).toBe(42);
  });

  it('rejects non-integers', () => {
    expect(() => coerceValue('3.14', 'int')).toThrow(ArgumentParseError);
    expect(() => coerceValue('abc', 'int')).toThrow(/not an integer/);
  });

  it('parses floats (and accepts integer syntax)', () => {
    expect(coerceValue('3.14', 'float')).toBe(3.14);
    expect(coerceValue('42', 'float')).toBe(42);
  });

  it('rejects non-numbers for float', () => {
    expect(() => coerceValue('abc', 'float')).toThrow(/not a number/);
  });

  it('validates enum membership', () => {
    expect(coerceValue('b', 'enum', ['a', 'b', 'c'])).toBe('b');
    expect(() => coerceValue('d', 'enum', ['a', 'b', 'c'])).toThrow(/not one of/);
  });

  it('resolves paths to absolute', () => {
    expect(coerceValue('foo', 'path')).toBe(resolvePath('foo'));
    expect(coerceValue('/abs/path', 'path')).toBe('/abs/path');
  });

  it('passes glob patterns through', () => {
    expect(coerceValue('src/**/*.ts', 'glob')).toBe('src/**/*.ts');
  });

  it('leaves untyped values as strings', () => {
    const type: CoercionType | undefined = undefined;
    expect(coerceValue('hello', type)).toBe('hello');
  });
});

describe('typed signatures', () => {
  it('parses declared types and enum values', () => {
    const sig = parseSignature('run {count:int} {mode:enum[a,b]} [--port:int]');
    expect(sig.args[0]).toMatchObject({ name: 'count', type: 'int' });
    expect(sig.args[1]).toMatchObject({ name: 'mode', type: 'enum', enumValues: ['a', 'b'] });
    expect(sig.options[0]).toMatchObject({ name: 'port', type: 'int', takesValue: true });
  });

  it('coerces positionals and typed defaults at parse time', () => {
    const sig = parseSignature('run {count:int} {mode:enum[a,b]=a} [--port:int=8080]');
    const input = parseInput(sig, ['5', 'b']);
    expect(input.args).toEqual({ count: 5, mode: 'b' });
    expect(input.options).toEqual({ port: 8080 });
  });

  it('coerces --opt=value at parse time', () => {
    const sig = parseSignature('run {count:int} [--port:int]');
    const input = parseInput(sig, ['5', '--port=3000']);
    expect(input.options.port).toBe(3000);
  });

  it('leaves untyped args as strings', () => {
    const sig = parseSignature('run {name}');
    const input = parseInput(sig, ['hello']);
    expect(input.args.name).toBe('hello');
  });

  it('rejects a bad int and a bad enum', () => {
    expect(() => parseInput(parseSignature('run {count:int}'), ['abc'])).toThrow(ArgumentParseError);
    expect(() => parseInput(parseSignature('run {mode:enum[a,b]}'), ['nope'])).toThrow(/not one of/);
  });

  it('rejects a variadic argument with a type', () => {
    expect(() => parseSignature('x {nums:int...}')).toThrow(/cannot declare a type/);
  });
});
