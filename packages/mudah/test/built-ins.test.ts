import { describe, expect, it } from 'vitest';
import { firstNonFlag } from '../src/built-ins.js';

describe('firstNonFlag', () => {
  it('returns the first positional token', () => {
    expect(firstNonFlag(['hello', '--once'])).toBe('hello');
    expect(firstNonFlag(['--once', 'hello'])).toBe('hello');
    expect(firstNonFlag(['--debounce', '20', 'doctor'])).toBe('doctor');
    expect(firstNonFlag(['--debounce=20', 'doctor'])).toBe('doctor');
    expect(firstNonFlag(['--once'])).toBeUndefined();
  });
});
