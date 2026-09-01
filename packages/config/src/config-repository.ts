import { assignPath, deepMerge, hasPath, isPlainObject, readPath, removePath } from './paths.js';
import { schemaAt, validateSchema, type Schema, type SchemaResult } from './schema.js';

/**
 * Where a dotted key last came from. Later layers win in the usual
 * defaults < file < env < flag < remote < runtime stack; the repository
 * records whichever layer the caller passes to `set` / `merge`.
 */
export type ConfigLayer = 'default' | 'file' | 'env' | 'flag' | 'remote' | 'runtime';

/** A single key's recorded layer and current value. */
export interface ConfigSource {
  readonly layer: ConfigLayer;
  readonly value: unknown;
}

/** One row of {@link ConfigRepository.precedence}. */
export interface PrecedenceRow {
  readonly key: string;
  readonly layer: ConfigLayer;
  readonly value: unknown;
}

function joinKey(prefix: string, name: string): string {
  return prefix === '' ? name : `${prefix}.${name}`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Render precedence rows as `key  layer  value` lines (two spaces between
 * fields), e.g. `app.name  file  mudah`.
 */
export function formatPrecedence(rows: ReadonlyArray<PrecedenceRow>): string[] {
  return rows.map((row) => `${row.key}  ${row.layer}  ${formatValue(row.value)}`);
}

/**
 * Dotted-key configuration repository.
 *
 * Values are stored in a nested plain object; keys use dot notation
 * (`app.name`). `merge` follows standard merge semantics: existing values win over
 * the merged-in defaults.
 */
export class ConfigRepository {
  private root: Record<string, unknown> = {};
  private onChange?: (key: string) => void;
  private readonly layers = new Map<string, ConfigLayer>();
  private boundSchema: Schema<unknown> | undefined;

  /** Register a callback to be notified when any config value is mutated. */
  onChangeNotification(cb: (key: string) => void): void {
    this.onChange = cb;
  }

  /**
   * Bind a schema used by `config:set` / `config:validate` to reject unknown
   * keys and type violations. Pass `undefined` to clear.
   */
  bindSchema(schema: Schema<unknown> | undefined): this {
    this.boundSchema = schema;
    return this;
  }

  /** The schema bound by {@link bindSchema}, if any. */
  get schema(): Schema<unknown> | undefined {
    return this.boundSchema;
  }

  set schema(schema: Schema<unknown> | undefined) {
    this.boundSchema = schema;
  }

  private notify(key: string): void {
    this.onChange?.(key);
  }

  /**
   * Set a value at a dotted key, creating intermediate objects as needed.
   * `layer` defaults to `'runtime'`.
   */
  set(key: string, value: unknown, layer: ConfigLayer = 'runtime'): this {
    assignPath(this.root, key, value);
    this.recordLayer(key, value, layer);
    this.pruneMissing(key);
    this.notify(key);
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
    const removed = removePath(this.root, key);
    if (removed) {
      this.removeLayers(key);
      this.notify(key);
    }
    return removed;
  }

  /** The entire configuration tree (live reference, use with care). */
  all(): Record<string, unknown> {
    return this.root;
  }

  /**
   * Merge defaults under an existing config group. Values already present
   * win; missing keys are filled in. Newly filled keys are tagged with
   * `layer` (default `'default'`).
   */
  merge(key: string, defaults: Record<string, unknown>, layer: ConfigLayer = 'default'): this {
    const existing = this.get<Record<string, unknown> | undefined>(key, undefined);
    const base = isPlainObject(existing) ? existing : {};
    assignPath(this.root, key, deepMerge(base, defaults));
    this.recordFilled(key, isPlainObject(existing) ? existing : undefined, defaults, layer);
    this.notify(key);
    return this;
  }

  /**
   * Which layer last set `key`. `undefined` when the key was never recorded
   * (missing, or created only as an intermediate object).
   */
  source(key: string): ConfigSource | undefined {
    const layer = this.layers.get(key);
    if (layer === undefined) return undefined;
    return { layer, value: this.get(key) };
  }

  /** Every recorded key, sorted, with its layer and current value. */
  precedence(): PrecedenceRow[] {
    return [...this.layers.keys()]
      .sort()
      .filter((key) => hasPath(this.root, key))
      .map((key) => ({
        key,
        layer: this.layers.get(key)!,
        value: this.get(key),
      }));
  }

  /** Replace the entire configuration tree. */
  clear(): this {
    this.root = {};
    this.layers.clear();
    return this;
  }

  /**
   * Check a subtree against `schema`. Reports every problem at once, with
   * paths relative to `key` (`db.pool` for `validate('db', …)`).
   *
   * Use at boot: a config typo then fails loudly instead of surfacing as a
   * confusing `undefined` three layers down.
   */
  validate<T>(key: string, schema: Schema<T>): SchemaResult<T> {
    const value = key === '' ? this.root : this.get(key, undefined);
    return validateSchema(schema, value, key);
  }

  /**
   * Schema node at `key` when a schema is bound. `undefined` for unknown
   * keys (or when nothing is bound).
   */
  schemaAt(key: string): Schema<unknown> | undefined {
    if (this.boundSchema === undefined) return undefined;
    return schemaAt(this.boundSchema, key);
  }

  private recordLayer(key: string, value: unknown, layer: ConfigLayer): void {
    this.layers.set(key, layer);
    if (isPlainObject(value)) {
      for (const [name, child] of Object.entries(value)) {
        this.recordLayer(joinKey(key, name), child, layer);
      }
    }
  }

  private recordFilled(
    prefix: string,
    existing: Record<string, unknown> | undefined,
    incoming: Record<string, unknown>,
    layer: ConfigLayer,
  ): void {
    for (const [name, value] of Object.entries(incoming)) {
      const path = joinKey(prefix, name);
      const had = existing?.[name];
      if (isPlainObject(value)) {
        this.recordFilled(path, isPlainObject(had) ? had : undefined, value, layer);
      } else if (had === undefined) {
        this.layers.set(path, layer);
      }
    }
  }

  private pruneMissing(prefix: string): void {
    for (const key of [...this.layers.keys()]) {
      if ((key === prefix || key.startsWith(`${prefix}.`)) && !hasPath(this.root, key)) {
        this.layers.delete(key);
      }
    }
  }

  private removeLayers(prefix: string): void {
    for (const key of [...this.layers.keys()]) {
      if (key === prefix || key.startsWith(`${prefix}.`)) this.layers.delete(key);
    }
  }
}
