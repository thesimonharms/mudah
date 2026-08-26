/**
 * Load a `.env` file into `process.env` using the native
 * `process.loadEnvFile`. Returns false when the file does not exist, so
 * scaffolds work before a `.env` is created.
 */
export function loadEnvFile(path = '.env'): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a typed environment variable. Strings are parsed to booleans
 * (`true`/`false`), null, numbers, and JSON objects/arrays when they look
 * like them; everything else passes through as a string.
 */
export function env<T = string>(key: string, defaultValue?: T): T | undefined {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  return parseValue<T>(raw);
}

function parseValue<T>(raw: string): T {
  const lowered = raw.toLowerCase();
  if (lowered === 'true') return true as T;
  if (lowered === 'false') return false as T;
  if (lowered === 'null' || lowered === 'none') return null as T;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw) as T;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }
  return raw as T;
}
