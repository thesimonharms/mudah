export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function segments(key: string): string[] {
  return key.split('.');
}

export function readPath(root: Record<string, unknown>, key: string, defaultValue?: unknown): unknown {
  let current: unknown = root;
  for (const segment of segments(key)) {
    if (!isPlainObject(current)) return defaultValue;
    current = current[segment];
  }
  return current === undefined ? defaultValue : current;
}

export function hasPath(root: Record<string, unknown>, key: string): boolean {
  let current: unknown = root;
  const parts = segments(key);
  for (const segment of parts) {
    if (!isPlainObject(current) || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

export function assignPath(root: Record<string, unknown>, key: string, value: unknown): void {
  const parts = segments(key);
  let current: Record<string, unknown> = root;
  for (const segment of parts.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainObject(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1] as string;
  current[last] = value;
}

export function removePath(root: Record<string, unknown>, key: string): boolean {
  const parts = segments(key);
  let current: Record<string, unknown> = root;
  for (const segment of parts.slice(0, -1)) {
    const next = current[segment];
    if (!isPlainObject(next)) return false;
    current = next;
  }
  const last = parts[parts.length - 1] as string;
  if (!(last in current)) return false;
  delete current[last];
  return true;
}

/**
 * Deep-merge where `target` wins: values already present in the target are
 * kept, missing keys are filled in from `source` (mergeConfig semantics).
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else if (existing === undefined) {
      result[key] = value;
    }
  }
  return result as T;
}
