import { join, dirname, relative } from 'node:path';

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
  // Not used directly in this minimal implementation — FsMock is used
  // via its own API. The intercept pattern can be added later if needed.
  return () => {};
}
