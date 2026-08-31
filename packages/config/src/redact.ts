import { isPlainObject } from './paths.js';

/** Key names whose values are treated as secrets and masked in dumps. */
export const REDACT_KEYS: ReadonlyArray<RegExp> = [
  /password/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /credential/i,
  /private[-_]?key/i,
  /^url$/i,
  /^dsn$/i,
  /^connection[-_]?string$/i,
];

export interface RedactOptions {
  /** Override the set of sensitive key patterns. */
  keys?: ReadonlyArray<RegExp>;
  /** Replacement rendered in place of a redacted value. */
  mask?: string;
}

/**
 * Recursively replace values whose key is sensitive. Scalars under matching
 * keys become `mask`; objects/arrays recurse so sensitive leaves are masked
 * regardless of depth. Non-sensitive scalars and arrays pass through unchanged.
 */
export function redactSecrets(value: unknown, options: RedactOptions = {}): unknown {
  const patterns = options.keys ?? REDACT_KEYS;
  const mask = options.mask ?? '[redacted]';

  const matches = (name: string): boolean => patterns.some((pattern) => pattern.test(name));

  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (isPlainObject(input)) {
      const out: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(input)) {
        out[key] = matches(key) ? mask : walk(v);
      }
      return out;
    }
    return input;
  };

  return walk(value);
}
