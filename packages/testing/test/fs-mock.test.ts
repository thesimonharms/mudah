import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { FsMock, mockFs } from '@mudah-cli/testing';

const fs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs');

describe('FsMock', () => {
  it('writes and reads files', () => {
    const fs = new FsMock();
    fs.write('/hello.txt', 'world');
    expect(fs.read('/hello.txt')).toBe('world');
    expect(fs.read('/missing.txt')).toBeUndefined();
  });

  it('creates directories and lists them', () => {
    const fs = new FsMock();
    fs.mkdir('/src');
    fs.write('/src/index.ts', 'export {}');
    fs.write('/src/utils.ts', 'export {}');
    expect(fs.readdir('/src')).toEqual(['index.ts', 'utils.ts']);
    expect(fs.isDir('/src')).toBe(true);
    expect(fs.isDir('/src/index.ts')).toBe(false);
  });

  it('handles nested paths', () => {
    const fs = new FsMock();
    fs.write('/a/b/c.txt', 'deep');
    expect(fs.read('/a/b/c.txt')).toBe('deep');
    expect(fs.readdir('/a')).toEqual(['b']);
    expect(fs.readdirRecursive('/a')).toEqual(['b', 'b/c.txt']);
  });

  it('deletes files', () => {
    const fs = new FsMock();
    fs.write('/tmp.txt', 'temp');
    expect(fs.exists('/tmp.txt')).toBe(true);
    fs.rm('/tmp.txt');
    expect(fs.exists('/tmp.txt')).toBe(false);
    expect(fs.rm('/missing')).toBe(false);
  });

  it('readdir on missing dir returns empty array', () => {
    const fsMock = new FsMock();
    expect(fsMock.readdir('/nope')).toEqual([]);
  });

  it('intercepts readFileSync and writeFileSync', () => {
    const mock = new FsMock();
    mock.write('/virtual.txt', 'from-mock');
    const restore = mockFs(mock);
    try {
      expect(fs.readFileSync('/virtual.txt', 'utf8')).toBe('from-mock');
      fs.writeFileSync('/written.txt', 'saved');
      expect(mock.read('/written.txt')).toBe('saved');
    } finally {
      restore();
    }
  });
});
