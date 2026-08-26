import { assignPath, deepMerge, hasPath, isPlainObject, readPath, removePath } from './paths.js';

/**
 * Dotted-key configuration repository.
 *
 * Values are stored in a nested plain object; keys use dot notation
 * (`app.name`). `merge` follows standard merge semantics: existing values win over
 * the merged-in defaults.
 */
export class ConfigRepository {
  private root: Record<string, unknown> = {};

  /** Set a value at a dotted key, creating intermediate objects as needed. */
  set(key: string, value: unknown): this {
    assignPath(this.root, key, value);
    return this;
  }

  /** Read a value at a dotted key, or `defaultValue` when missing. */
  get<T = unknown>(key: string, defaultValue?: T): T {
    return readPath(this.root, key, defaultValue) as T;
  }

  /** Whether a dotted key holds a value. */
  has(key: string): boolean {
    return hasPath(this.root, key);
  }

  /** Remove a dotted key. Returns whether anything was removed. */
  delete(key: string): boolean {
    return removePath(this.root, key);
  }

  /** The entire configuration tree (live reference, use with care). */
  all(): Record<string, unknown> {
    return this.root;
  }

  /**
   * Merge defaults under an existing config group. Values already present
   * win; missing keys are filled in.
   */
  merge(key: string, defaults: Record<string, unknown>): this {
    const existing = this.get<Record<string, unknown> | undefined>(key, undefined);
    const base = isPlainObject(existing) ? existing : {};
    this.set(key, deepMerge(base, defaults));
    return this;
  }

  /** Replace the entire configuration tree. */
  clear(): this {
    this.root = {};
    return this;
  }
}
