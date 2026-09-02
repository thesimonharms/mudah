import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

/** Adapter interface for reading directory entries. */
export interface FileAdapter {
  readdir(path: string): Promise<string[]>;
  isDir(path: string): Promise<boolean>;
}

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  depth: number;
}

export interface FileBrowserOptions {
  /** Root directory path (default: '.'). */
  root?: string;
  /** File extension filter (e.g. '.ts'). Omit for all. */
  filter?: string;
  /** Called when the user selects a file. */
  onSelect?: (path: string) => void;
}

/**
 * Tree-based file browser. Navigate with arrow keys, expand directories,
 * type to fuzzy-filter, and select a file with enter.
 */
export class FileBrowser extends BaseComponent {
  private entries: FileEntry[] = [];
  private readonly expanded = new Set<string>();
  private query = '';
  selectedIndex = 0;
  private readonly root: string;
  private readonly filter?: string;
  private readonly onSelect?: (path: string) => void;
  private loaded = false;
  private adapter: FileAdapter | undefined;

  constructor(options: FileBrowserOptions = {}) {
    super();
    this.root = options.root ?? '.';
    this.filter = options.filter;
    this.onSelect = options.onSelect;
  }

  async load(adapter: FileAdapter): Promise<void> {
    this.adapter = adapter;
    this.entries = await this.scan(adapter, this.root, '', 0, false);
    this.loaded = true;
  }

  private async scan(
    adapter: FileAdapter,
    dir: string,
    prefix: string,
    depth: number,
    intoExpanded: boolean,
  ): Promise<FileEntry[]> {
    const names = await adapter.readdir(dir);
    const entries: FileEntry[] = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const fullPath = prefix === '' ? name : `${prefix}/${name}`;
      const isDir = await adapter.isDir(`${dir}/${name}`);
      if (!isDir && this.filter && !name.endsWith(this.filter)) continue;
      entries.push({ name, path: fullPath, isDir, depth });
      if (isDir && (intoExpanded || this.expanded.has(fullPath))) {
        const children = await this.scan(adapter, `${dir}/${name}`, fullPath, depth + 1, true);
        entries.push(...children);
      }
    }
    return entries;
  }

  private visible(): FileEntry[] {
    const q = this.query.toLowerCase();
    if (q.length === 0) return this.entries;
    return this.entries.filter((entry) => fuzzySubsequence(q, entry.path) || fuzzySubsequence(q, entry.name));
  }

  render(): string[] {
    if (!this.loaded) return ['  (loading...)'];
    const rows = this.visible();
    if (rows.length === 0) return [this.query.length > 0 ? `  (no matches for ${this.query})` : '  (empty)'];
    const lines = rows.map((entry, i) => {
      const pointer = i === this.selectedIndex ? '▸ ' : '  ';
      const indent = '  '.repeat(entry.depth);
      const mark = entry.isDir ? (this.expanded.has(entry.path) ? '▼ ' : '▶ ') : '  ';
      return `${pointer}${indent}${mark}${entry.name}`;
    });
    if (this.query.length > 0) lines.unshift(`/${this.query}`);
    return lines;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'fileBrowser', name: this.visible()[this.selectedIndex]?.path, value: this.selectedIndex };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    const rows = this.visible();
    switch (event.name) {
      case 'up':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        return true;
      case 'down':
        this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
        return true;
      case 'space':
      case 'right': {
        const entry = rows[this.selectedIndex];
        if (entry?.isDir) {
          if (this.expanded.has(entry.path)) this.expanded.delete(entry.path);
          else this.expanded.add(entry.path);
          if (this.adapter) void this.reload();
        }
        return true;
      }
      case 'left': {
        const entry = rows[this.selectedIndex];
        if (entry?.isDir && this.expanded.has(entry.path)) {
          this.expanded.delete(entry.path);
          if (this.adapter) void this.reload();
        }
        return true;
      }
      case 'backspace':
        this.query = this.query.slice(0, -1);
        this.selectedIndex = 0;
        return true;
      case 'enter': {
        const entry = rows[this.selectedIndex];
        if (entry && !entry.isDir) this.onSelect?.(entry.path);
        return true;
      }
      default:
        if (event.ch !== undefined && event.ch >= ' ') {
          this.query += event.ch;
          this.selectedIndex = 0;
          return true;
        }
        return false;
    }
  }

  private async reload(): Promise<void> {
    if (!this.adapter) return;
    this.entries = await this.scan(this.adapter, this.root, '', 0, false);
    const max = Math.max(0, this.visible().length - 1);
    this.selectedIndex = Math.min(this.selectedIndex, max);
  }
}

/** True when every query character appears in order in `text`. */
function fuzzySubsequence(query: string, text: string): boolean {
  const hay = text.toLowerCase();
  let i = 0;
  for (const ch of hay) {
    if (ch === query[i]) i += 1;
    if (i >= query.length) return true;
  }
  return false;
}
