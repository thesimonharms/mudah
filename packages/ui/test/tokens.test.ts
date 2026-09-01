import { describe, expect, it } from 'vitest';
import { PAINT_TOKENS, paint, paintToken, sleekDark, sleekLight } from '@mudah-cli/ui';

describe('PAINT_TOKENS', () => {
  it('documents every ThemeColors key', () => {
    expect(Object.keys(PAINT_TOKENS).sort()).toEqual(Object.keys(sleekDark.colors).sort());
    expect(PAINT_TOKENS.accent).toMatch(/accent/i);
    expect(PAINT_TOKENS.success.length).toBeGreaterThan(0);
    expect(PAINT_TOKENS.error.length).toBeGreaterThan(0);
  });
});

describe('paintToken', () => {
  it('returns plain text at level 0', () => {
    expect(paintToken('accent', 'hello', { level: 0 })).toBe('hello');
  });

  it('paints with theme.colors[token] via paint()', () => {
    const expected = paint(sleekDark.colors.accent, 'hello', 24);
    expect(paintToken('accent', 'hello', { level: 24 })).toBe(expected);
    expect(paintToken('error', 'x', { level: 24, theme: sleekLight })).toBe(
      paint(sleekLight.colors.error, 'x', 24),
    );
  });
});
