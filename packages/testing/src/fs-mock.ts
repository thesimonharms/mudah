import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs') as typeof import('node:fs');

interface FsNode {
  type: 'file' | 'dir';
  content?: string;
  children?: Map<string, FsNode>;
}

/**
 * In-memory virtual filesystem for testing.
 * No disk I/O — everything stays in memory.
 *
 * ```ts
 * const fs = new FsMock();
 * fs.write('/etc/config.json', '{}');
 * const text = fs.read('/etc/config.json');
 * expect(text).toBe('{}');
 * ```
 */
export class FsMock {
  private root: FsNode = { type: 'dir', children: new Map() };

  write(path: string, content: string): void {
    const parts = path.split('/').filter(Boolean);
    let node = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children) node.children = new Map();
      let child = node.children.get(parts[i]!);
      if (!child) {
        child = { type: 'dir', children: new Map() };
        node.children.set(parts[i]!, child);
      }
      node = child;
    }
    if (!node.children) node.children = new Map();
    node.children.set(parts[parts.length - 1]!, { type: 'file', content });
  }

  read(path: string): string | undefined {
    const node = this.resolve(path);
    return node?.type === 'file' ? node.content : undefined;
  }

  exists(path: string): boolean {
    return this.resolve(path) !== undefined;
  }

  isDir(path: string): boolean {
    return this.resolve(path)?.type === 'dir';
  }

  readdir(path: string): string[] {
    const node = this.resolve(path);
    return node?.type === 'dir' && node.children
      ? [...node.children.keys()].sort()
      : [];
  }

  readdirRecursive(path: string): string[] {
    const out: string[] = [];
    const walk = (node: FsNode, prefix: string) => {
      if (!node.children) return;
      for (const [name, child] of node.children) {
        const fullPath = prefix === '' ? name : `${prefix}/${name}`;
        out.push(fullPath);
        if (child.type === 'dir') walk(child, fullPath);
      }
    };
    const dir = this.resolve(path);
    if (dir?.type === 'dir') walk(dir, '');
    return out.sort();
  }

  rm(path: string): boolean {
    const parts = path.split('/').filter(Boolean);
    let node = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      const child = node.children?.get(parts[i]!);
      if (!child) return false;
      node = child;
    }
    return node.children?.delete(parts[parts.length - 1]!) ?? false;
  }

  mkdir(path: string): void {
    const parts = path.split('/').filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      if (!node.children) node.children = new Map();
      let child = node.children.get(part);
      if (!child) {
        child = { type: 'dir', children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
  }

  private resolve(path: string): FsNode | undefined {
    const parts = path.split('/').filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      const next = node.children?.get(part);
      if (!next) return undefined;
      node = next;
    }
    return node;
  }
}

/**
 * Global mock helpers: intercept `readFileSync` / `writeFileSync` calls
 * and redirect them to a FsMock instance.
 *
 * ```ts
 * const mock = new FsMock();
 * const restore = mockFs(mock);
 * // Now code using fs.readFileSync reads from `mock`
 * restore(); // Back to real fs
 * ```
 */
export function mockFs(mock: FsMock): () => void {
  const previousRead = fs.readFileSync;
  const previousWrite = fs.writeFileSync;
  const previousExists = fs.existsSync;

  fs.readFileSync = ((path: unknown, encoding?: unknown) => {
    const key = String(path);
    const text = mock.read(key) ?? mock.read(`/${key}`);
    if (text === undefined) {
      const err = new Error(`ENOENT: no such file or directory, open '${key}'`) as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    }
    const enc =
      encoding === 'utf8' ||
      encoding === 'utf-8' ||
      (typeof encoding === 'object' && encoding !== null && (encoding as { encoding?: string }).encoding === 'utf8');
    return enc ? text : Buffer.from(text);
  }) as typeof fs.readFileSync;

  fs.writeFileSync = ((path: unknown, data: unknown) => {
    mock.write(String(path), typeof data === 'string' ? data : Buffer.from(data as Uint8Array).toString('utf8'));
  }) as typeof fs.writeFileSync;

  fs.existsSync = ((path: unknown) => {
    const key = String(path);
    return mock.exists(key) || mock.exists(`/${key}`);
  }) as typeof fs.existsSync;

  return () => {
    fs.readFileSync = previousRead;
    fs.writeFileSync = previousWrite;
    fs.existsSync = previousExists;
  };
}
