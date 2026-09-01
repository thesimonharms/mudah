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
 * and select a file with enter.
 *
 * ```ts
 * const browser = new FileBrowser({
 *   root: './src',
 *   filter: '.ts',
 *   onSelect: (path) => console.log(`Selected: ${path}`),
 * });
 * browser.load(fsAdapter);
 * // ... mount in layout, run event loop ...
 * ```
 */
export class FileBrowser extends BaseComponent {
  private entries: FileEntry[] = [];
  private readonly expanded = new Set<string>();
  selectedIndex = 0;
  private readonly root: string;
  private readonly filter?: string;
  private readonly onSelect?: (path: string) => void;
  private loaded = false;

  constructor(options: FileBrowserOptions = {}) {
    super();
    this.root = options.root ?? '.';
    this.filter = options.filter;
    this.onSelect = options.onSelect;
  }

  async load(adapter: FileAdapter): Promise<void> {
    this.entries = await this.scan(adapter, this.root, '');
    this.loaded = true;
  }

  private async scan(adapter: FileAdapter, dir: string, prefix: string): Promise<FileEntry[]> {
    const names = await adapter.readdir(dir);
    const entries: FileEntry[] = [];
    for (const name of names) {
      if (name.startsWith('.')) continue;
      const fullPath = prefix === '' ? name : `${prefix}/${name}`;
      const isDir = await adapter.isDir(`${dir}/${name}`);
      if (!isDir && this.filter && !name.endsWith(this.filter)) continue;
      entries.push({ name, path: fullPath, isDir });
      if (isDir) {
        const children = await this.scan(adapter, `${dir}/${name}`, fullPath);
        entries.push(...children);
      }
    }
    return entries;
  }

  render(): string[] {
    if (!this.loaded) return ['  (loading...)'];
    if (this.entries.length === 0) return ['  (empty)'];
    return this.entries.map((entry, i) => {
      const pointer = i === this.selectedIndex ? '▸ ' : '  ';
      const mark = entry.isDir ? (this.expanded.has(entry.path) ? '▼ ' : '▶ ') : '  ';
      return `${pointer}${mark}${entry.name}`;
    });
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'fileBrowser', name: this.entries[this.selectedIndex]?.path, value: this.selectedIndex };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        return true;
      case 'down':
        this.selectedIndex = Math.min(this.entries.length - 1, this.selectedIndex + 1);
        return true;
      case 'space':
      case 'right': {
        const entry = this.entries[this.selectedIndex];
        if (entry?.isDir) {
          if (this.expanded.has(entry.path)) this.expanded.delete(entry.path);
          else this.expanded.add(entry.path);
        }
        return true;
      }
      case 'enter': {
        const entry = this.entries[this.selectedIndex];
        if (entry && !entry.isDir) {
          this.onSelect?.(entry.path);
        }
        return true;
      }
      default:
        return false;
    }
  }
}
