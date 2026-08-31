import { describe, expect, it } from 'vitest';
import { assertHasColor, assertLacksColor } from '@mudah-cli/testing';

describe('assertHasColor', () => {
  it('passes when a fragment is painted with the expected hex', () => {
    const text = `\x1b[38;2;122;162;247mHello\x1b[39m world`;
    expect(() => assertHasColor(text, { text: 'Hello', hex: '#7aa2f7' })).not.toThrow();
  });

  it('throws when the fragment is missing', () => {
    const text = 'plain text';
    expect(() => assertHasColor(text, { text: 'missing', hex: '#7aa2f7' })).toThrow(/does not contain/);
  });

  it('throws when the fragment is unstyled', () => {
    const text = 'plain text';
    expect(() => assertHasColor(text, { text: 'plain', hex: '#7aa2f7' })).toThrow(/default style/);
  });

  it('throws when the painted color differs from the expected one', () => {
    const text = `\x1b[38;2;255;0;0mWrong\x1b[39m`;
    expect(() => assertHasColor(text, { text: 'Wrong', hex: '#7aa2f7' })).toThrow(/painted with #ff0000/);
  });
});

describe('assertLacksColor', () => {
  it('passes when the fragment is absent', () => {
    expect(() => assertLacksColor('plain', { text: 'missing', hex: '#7aa2f7' })).not.toThrow();
  });

  it('passes when the fragment is present but in a different color', () => {
    const text = `\x1b[38;2;255;0;0mHello\x1b[39m`;
    expect(() => assertLacksColor(text, { text: 'Hello', hex: '#7aa2f7' })).not.toThrow();
  });

  it('throws when the fragment is painted with the forbidden color', () => {
    const text = `\x1b[38;2;122;162;247mHello\x1b[39m`;
    expect(() => assertLacksColor(text, { text: 'Hello', hex: '#7aa2f7' })).toThrow(/should not/);
  });
});
