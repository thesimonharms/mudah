import { describe, expect, it } from 'vitest';
import { editDistance, fuzzyRank, suggestCommand } from '@mudah-cli/console';

describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('hello', 'hello')).toBe(0);
  });

  it('handles insertions', () => {
    expect(editDistance('cat', 'cats')).toBe(1);
  });

  it('handles substitutions', () => {
    expect(editDistance('cat', 'bat')).toBe(1);
  });

  it('handles multi-edit transpositions', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('fuzzyRank', () => {
  it('ranks closest match first', () => {
    const ranked = fuzzyRank('stagi', ['staging', 'production', 'deploy']);
    expect(ranked[0]?.name).toBe('staging');
  });

  it('prefers a prefix match over equal edit distance', () => {
    const ranked = fuzzyRank('prod', ['production', 'preproduction']);
    expect(ranked[0]?.name).toBe('production');
  });
});

describe('suggestCommand', () => {
  it('returns the top match for a one-edit typo', () => {
    expect(suggestCommand('stagin', ['staging', 'production', 'deploy'])).toBe('staging');
  });

  it('returns undefined when the best match is too far away', () => {
    expect(suggestCommand('xyz', ['staging', 'production'])).toBeUndefined();
  });

  it('returns undefined for a long, multi-edit typo', () => {
    // nope -> make is 2 edits; nope -> "staging" is 5. The 2-edit match would
    // be misleading, so the default maxDistance should reject it.
    expect(suggestCommand('nope', ['make', 'staging', 'production', 'hello'])).toBeUndefined();
  });

  it('returns undefined for an empty typo', () => {
    expect(suggestCommand('', ['staging'])).toBeUndefined();
  });

  it('returns undefined when two candidates tie', () => {
    expect(suggestCommand('a', ['a', 'a'])).toBeUndefined();
  });
});
