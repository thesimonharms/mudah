/**
 * Minimal, zero-dependency config schema validation.
 *
 * Schemas describe the shape of a config file, validate it at boot, and
 * report every problem at once with dotted paths (`db.pool`) instead of
 * failing on the first bad key.
 *
 * ```ts
 * // config/database.ts
 * import { defineConfig, s } from '@mudah-cli/config';
 *
 * export default defineConfig(
 *   s.object({
 *     url: s.string(),
 *     pool: s.number().min(1).default(5),
 *     ssl: s.boolean().default(false),
 *   }),
 * );
 * ```
 */

export interface SchemaIssue {
  /** Dotted path to the offending value (`db.pool`, `servers.0.host`). */
  readonly path: string;
  /** What went wrong. */
  readonly message: string;
}

export interface SchemaResult<T> {
  readonly ok: boolean;
  /** The parsed value: coerced, defaults filled in. Only valid when `ok`. */
  readonly value: T;
  /** Every problem found, in document order. Empty when `ok`. */
  readonly issues: readonly SchemaIssue[];
}

export class ConfigValidationError extends Error {
  readonly issues: readonly SchemaIssue[];

  constructor(issues: readonly SchemaIssue[]) {
    super(
      `Invalid configuration:\n${issues.map((i) => `  ${i.path === '' ? '(root)' : i.path}: ${i.message}`).join('\n')}`,
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/** What every schema node exposes. */
export interface Schema<T> {
  readonly type: string;
  /** True when a missing value is acceptable (via `optional()`/`default()`). */
  readonly isOptional: boolean;
  /** Human-readable type name used in error messages. */
  readonly label: string;
  /** Validate (and coerce) an unknown value. Returns issues; never throws. */
  parse(value: unknown, path: string, issues: SchemaIssue[]): T;
  /** Whether a missing value is acceptable for this node. */
  acceptsMissing(): boolean;
  /** The value this node contributes when nothing is supplied. */
  fallback(): T | undefined;
  /** Documentation string set by `describe()`, when present. */
  describeText(): string | undefined;
}

abstract class BaseSchema<T> implements Schema<T> {
  abstract readonly type: string;
  isOptional = false;
  private defaulted: { value: T } | undefined = undefined;
  private documented: string | undefined = undefined;

  abstract readonly label: string;

  /** Allow this key to be missing. */
  optional(): this {
    this.isOptional = true;
    return this;
  }

  /** Value used when the key is absent. Implies optional. */
  default(value: T): this {
    this.defaulted = { value };
    this.isOptional = true;
    return this;
  }

  /** Documentation only — surfaced by `describeText()`. */
  describe(text: string): this {
    this.documented = text;
    return this;
  }

  acceptsMissing(): boolean {
    return this.isOptional;
  }

  fallback(): T | undefined {
    return this.defaulted?.value;
  }

  describeText(): string | undefined {
    return this.documented;
  }

  /** Run the checks common to every node, then the node's own rules. */
  parse(value: unknown, path: string, issues: SchemaIssue[]): T {
    if (value === undefined) {
      const fallback = this.fallback();
      if (fallback !== undefined) return fallback;
      if (!this.isOptional) {
        issues.push({ path, message: `is required` });
      }
      return undefined as T;
    }
    return this.check(value, path, issues);
  }

  protected fail(issues: SchemaIssue[], path: string, message: string): void {
    issues.push({ path, message });
  }

  protected abstract check(value: unknown, path: string, issues: SchemaIssue[]): T;
}

class StringSchema extends BaseSchema<string> {
  readonly type = 'string';
  readonly label = 'string';
  private minLength: number | undefined;
  private maxLength: number | undefined;
  private pattern: RegExp | undefined;
  private readonly allowed: readonly string[] | undefined;

  constructor(allowed?: readonly string[]) {
    super();
    this.allowed = allowed;
  }

  min(length: number): this {
    this.minLength = length;
    return this;
  }

  max(length: number): this {
    this.maxLength = length;
    return this;
  }

  match(pattern: RegExp): this {
    this.pattern = pattern;
    return this;
  }

  protected check(value: unknown, path: string, issues: SchemaIssue[]): string {
    if (typeof value !== 'string') {
      this.fail(issues, path, `expected string, got ${typeName(value)}`);
      return '';
    }
    if (this.minLength !== undefined && value.length < this.minLength) {
      this.fail(issues, path, `must be at least ${this.minLength} characters`);
    }
    if (this.maxLength !== undefined && value.length > this.maxLength) {
      this.fail(issues, path, `must be at most ${this.maxLength} characters`);
    }
    if (this.pattern !== undefined && !this.pattern.test(value)) {
      this.fail(issues, path, `must match ${String(this.pattern)}`);
    }
    if (this.allowed !== undefined && !this.allowed.includes(value)) {
      this.fail(issues, path, `must be one of: ${this.allowed.join(', ')}`);
    }
    return value;
  }
}

class NumberSchema extends BaseSchema<number> {
  readonly type = 'number';
  readonly label = 'number';
  private minimum: number | undefined;
  private maximum: number | undefined;
  private integerOnly = false;

  min(value: number): this {
    this.minimum = value;
    return this;
  }

  max(value: number): this {
    this.maximum = value;
    return this;
  }

  int(): this {
    this.integerOnly = true;
    return this;
  }

  protected check(value: unknown, path: string, issues: SchemaIssue[]): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      this.fail(issues, path, `expected number, got ${typeName(value)}`);
      return 0;
    }
    if (this.integerOnly && !Number.isInteger(value)) {
      this.fail(issues, path, `must be an integer`);
    }
    if (this.minimum !== undefined && value < this.minimum) {
      this.fail(issues, path, `must be >= ${this.minimum}`);
    }
    if (this.maximum !== undefined && value > this.maximum) {
      this.fail(issues, path, `must be <= ${this.maximum}`);
    }
    return value;
  }
}

class BooleanSchema extends BaseSchema<boolean> {
  readonly type = 'boolean';
  readonly label = 'boolean';

  protected check(value: unknown, path: string, issues: SchemaIssue[]): boolean {
    if (typeof value !== 'boolean') {
      this.fail(issues, path, `expected boolean, got ${typeName(value)}`);
      return false;
    }
    return value;
  }
}

class ArraySchema<T> extends BaseSchema<T[]> {
  readonly type = 'array';
  readonly label = 'array';
  private minimum: number | undefined;
  private maximum: number | undefined;

  constructor(private readonly item: Schema<T>) {
    super();
  }

  min(length: number): this {
    this.minimum = length;
    return this;
  }

  max(length: number): this {
    this.maximum = length;
    return this;
  }

  protected check(value: unknown, path: string, issues: SchemaIssue[]): T[] {
    if (!Array.isArray(value)) {
      this.fail(issues, path, `expected array, got ${typeName(value)}`);
      return [];
    }
    if (this.minimum !== undefined && value.length < this.minimum) {
      this.fail(issues, path, `must have at least ${this.minimum} item(s)`);
    }
    if (this.maximum !== undefined && value.length > this.maximum) {
      this.fail(issues, path, `must have at most ${this.maximum} item(s)`);
    }
    return value.map((entry, index) => this.item.parse(entry, `${path}.${index}`, issues));
  }
}

type ObjectShape = Record<string, Schema<unknown>>;
type ObjectOutput<S extends ObjectShape> = {
  [K in keyof S]: S[K] extends Schema<infer V> ? V : never;
};

class ObjectSchema<S extends ObjectShape> extends BaseSchema<ObjectOutput<S>> {
  readonly type = 'object';
  readonly label = 'object';
  private strictMode = false;

  constructor(readonly shape: S) {
    super();
  }

  /** Reject keys the schema doesn't declare. */
  strict(): this {
    this.strictMode = true;
    return this;
  }

  protected check(value: unknown, path: string, issues: SchemaIssue[]): ObjectOutput<S> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(issues, path, `expected object, got ${typeName(value)}`);
      return {} as ObjectOutput<S>;
    }

    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, node] of Object.entries(this.shape)) {
      const childPath = path === '' ? key : `${path}.${key}`;
      const present = Object.prototype.hasOwnProperty.call(source, key);
      const parsed = node.parse(present ? source[key] : undefined, childPath, issues);
      if (present || parsed !== undefined) output[key] = parsed;
    }

    if (this.strictMode) {
      for (const key of Object.keys(source)) {
        if (!(key in this.shape)) {
          this.fail(issues, path === '' ? key : `${path}.${key}`, `is not a known key`);
        }
      }
    } else {
      // Keep undeclared keys so partial schemas don't silently drop config.
      for (const key of Object.keys(source)) {
        if (!(key in this.shape)) output[key] = source[key];
      }
    }

    return output as ObjectOutput<S>;
  }
}

class AnySchema extends BaseSchema<unknown> {
  readonly type = 'any';
  readonly label = 'any';

  protected check(value: unknown): unknown {
    return value;
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Fluent builders. Each returns the public interface, not the class, so a
 * schema can be exported from a module (declaration emit can't describe a
 * class with private state).
 */
export interface StringSchemaBuilder extends Schema<string> {
  min(length: number): StringSchemaBuilder;
  max(length: number): StringSchemaBuilder;
  match(pattern: RegExp): StringSchemaBuilder;
  optional(): StringSchemaBuilder;
  default(value: string): StringSchemaBuilder;
  describe(text: string): StringSchemaBuilder;
}

export interface NumberSchemaBuilder extends Schema<number> {
  min(value: number): NumberSchemaBuilder;
  max(value: number): NumberSchemaBuilder;
  int(): NumberSchemaBuilder;
  optional(): NumberSchemaBuilder;
  default(value: number): NumberSchemaBuilder;
  describe(text: string): NumberSchemaBuilder;
}

export interface BooleanSchemaBuilder extends Schema<boolean> {
  optional(): BooleanSchemaBuilder;
  default(value: boolean): BooleanSchemaBuilder;
  describe(text: string): BooleanSchemaBuilder;
}

export interface ArraySchemaBuilder<T> extends Schema<T[]> {
  min(length: number): ArraySchemaBuilder<T>;
  max(length: number): ArraySchemaBuilder<T>;
  optional(): ArraySchemaBuilder<T>;
  default(value: T[]): ArraySchemaBuilder<T>;
  describe(text: string): ArraySchemaBuilder<T>;
}

export interface ObjectSchemaBuilder<S extends ObjectShape> extends Schema<ObjectOutput<S>> {
  /** Reject keys the schema doesn't declare. */
  strict(): ObjectSchemaBuilder<S>;
  optional(): ObjectSchemaBuilder<S>;
  default(value: ObjectOutput<S>): ObjectSchemaBuilder<S>;
  describe(text: string): ObjectSchemaBuilder<S>;
  readonly shape: S;
}

export interface AnySchemaBuilder extends Schema<unknown> {
  optional(): AnySchemaBuilder;
  default(value: unknown): AnySchemaBuilder;
  describe(text: string): AnySchemaBuilder;
}

/** Schema builders. Compose them into `s.object({ … })`. */
export const s = {
  string(): StringSchemaBuilder {
    return new StringSchema();
  },
  /** A string restricted to `values`. */
  enum<T extends string>(values: readonly T[]): StringSchemaBuilder {
    return new StringSchema(values);
  },
  number(): NumberSchemaBuilder {
    return new NumberSchema();
  },
  boolean(): BooleanSchemaBuilder {
    return new BooleanSchema();
  },
  array<T>(item: Schema<T>): ArraySchemaBuilder<T> {
    return new ArraySchema(item);
  },
  object<S extends ObjectShape>(shape: S): ObjectSchemaBuilder<S> {
    return new ObjectSchema(shape);
  },
  /** Accept anything at this key. */
  any(): AnySchemaBuilder {
    return new AnySchema();
  },
};

/** Validate `value` against `schema`. Collects every issue; never throws. */
export function validateSchema<T>(
  schema: Schema<T>,
  value: unknown,
  path = '',
): SchemaResult<T> {
  const issues: SchemaIssue[] = [];
  const parsed = schema.parse(value, path, issues);
  return { ok: issues.length === 0, value: parsed, issues };
}

/**
 * Validate and throw a `ConfigValidationError` when anything is wrong. Use
 * this at boot — one error listing every bad key beats failing on the first.
 */
export function assertSchema<T>(schema: Schema<T>, value: unknown, path = ''): T {
  const result = validateSchema(schema, value, path);
  if (!result.ok) throw new ConfigValidationError(result.issues);
  return result.value;
}

export type { ObjectShape };
