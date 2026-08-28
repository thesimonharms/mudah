import { describe, expect, it } from 'vitest';
import { ArgumentParseError, parseInput, parseSignature } from '@mudah-cli/console';

describe('variadic signature args', () => {
  it('parses {paths...} as variadic', () => {
    const sig = parseSignature('convert {paths...} [--to=webp]');
    expect(sig.args).toHaveLength(1);
    expect(sig.args[0]).toMatchObject({ name: 'paths', variadic: true, optional: false });
  });

  it('collects all remaining positionals into lists', () => {
    const sig = parseSignature('convert {paths...}');
    const input = parseInput(sig, ['a.png', 'b.jpg', 'c.heic']);
    expect(input.lists['paths']).toEqual(['a.png', 'b.jpg', 'c.heic']);
    expect(input.args['paths']).toBeUndefined();
  });

  it('mixes fixed args before the variadic', () => {
    const sig = parseSignature('tag {label} {files...}');
    const input = parseInput(sig, ['x', '1.png', '2.png']);
    expect(input.args['label']).toBe('x');
    expect(input.lists['files']).toEqual(['1.png', '2.png']);
  });

  it('requires at least one value for variadics', () => {
    const sig = parseSignature('convert {paths...}');
    expect(() => parseInput(sig, [])).toThrow(ArgumentParseError);
    expect(() => parseInput(sig, [])).toThrow(/paths\.\.\./);
  });

  it('rejects a variadic with a default or optional marker', () => {
    expect(() => parseSignature('x {a...=1}')).toThrow(/cannot take a default/);
    expect(() => parseSignature('x {a?...}')).toThrow(/cannot also be optional/);
  });

  it('rejects a variadic that is not the final argument', () => {
    expect(() => parseSignature('x {a...} {b}')).toThrow(/must be the final argument/);
  });

  it('keeps non-variadic excess-positionals rejection', () => {
    const sig = parseSignature('greet {name?}');
    expect(() => parseInput(sig, ['a', 'b'])).toThrow(/Too many arguments/);
  });

  it('still supports -- terminator with variadics', () => {
    const sig = parseSignature('convert {paths...}');
    const input = parseInput(sig, ['--', '--weird.png']);
    expect(input.lists['paths']).toEqual(['--weird.png']);
  });
});
