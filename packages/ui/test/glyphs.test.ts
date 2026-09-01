import { describe, expect, it } from 'vitest';
import { diffGlyphs, diffGlyphsUnicode, formatDiffLine, sleekDark } from '@mudah-cli/ui';

describe('diffGlyphs', () => {
  it('exposes ascii markers and unicode variants', () => {
    expect(diffGlyphs).toEqual({ added: '+', modified: '~', deleted: '-', renamed: '→' });
    expect(diffGlyphsUnicode.added).toBe('✚');
    expect(diffGlyphsUnicode.modified).toBe('●');
    expect(diffGlyphsUnicode.deleted).toBe('✖');
    expect(diffGlyphsUnicode.renamed).toBe('→');
  });
});

describe('formatDiffLine', () => {
  it('prefixes text with the kind glyph', () => {
    expect(formatDiffLine('added', 'file.ts')).toBe('+ file.ts');
    expect(formatDiffLine('modified', 'file.ts')).toBe('~ file.ts');
    expect(formatDiffLine('deleted', 'file.ts')).toBe('- file.ts');
    expect(formatDiffLine('renamed', 'a → b')).toBe('→ a → b');
  });

  it('uses unicode variants when asked', () => {
    expect(formatDiffLine('added', 'x', { unicode: true })).toBe('✚ x');
    expect(formatDiffLine('deleted', 'x', { unicode: true })).toBe('✖ x');
  });

  it('paints with the matching theme token when color is on', () => {
    const added = formatDiffLine('added', 'x', { level: 24 });
    expect(added).toContain('\x1b[38;2;158;206;106m');
    expect(added).toContain('+ x');
    const deleted = formatDiffLine('deleted', 'x', { level: 24, theme: sleekDark });
    expect(deleted).toContain('\x1b[38;2;247;118;142m');
  });
});
