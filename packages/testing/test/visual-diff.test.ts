import { describe, expect, it } from 'vitest';
import { diffSnapshots, diffTrees } from '@mudah-cli/testing';

describe('diffSnapshots', () => {
  it('returns an empty string when the snapshots match', () => {
    expect(diffSnapshots('hello\nworld', 'hello\nworld')).toBe('');
  });

  it('marks deleted and inserted lines', () => {
    const diff = diffSnapshots('alpha\nbeta\ngamma', 'alpha\ndelta\ngamma');
    expect(diff).toContain(' alpha');
    expect(diff).toContain('-beta');
    expect(diff).toContain('+delta');
    expect(diff).toContain(' gamma');
  });

  it('adds inline char-level markers on a substituted line', () => {
    const diff = diffSnapshots('hello', 'hallo');
    expect(diff).toContain('-hello');
    expect(diff).toContain('+hallo');
    expect(diff).toContain('h[-e-]{+a+}llo');
  });

  it('marks a purely added line', () => {
    const diff = diffSnapshots('one', 'one\ntwo');
    expect(diff).toContain(' one');
    expect(diff).toContain('+two');
  });
});

describe('diffTrees', () => {
  it('returns an empty string when the trees match', () => {
    expect(diffTrees({ role: 'Column' }, { role: 'Column' })).toBe('');
  });

  it('reports role and child changes', () => {
    const diff = diffTrees(
      { role: 'Column', children: [{ role: 'list', name: 'a' }] },
      { role: 'Row', children: [{ role: 'list', name: 'b' }, { role: 'label' }] },
    );
    expect(diff).toContain('- $.role "Column"');
    expect(diff).toContain('+ $.role "Row"');
    expect(diff).toContain('- $.children[0].name "a"');
    expect(diff).toContain('+ $.children[0].name "b"');
    expect(diff).toContain('+ $.children[1]');
  });
});
