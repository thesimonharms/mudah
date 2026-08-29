import { assertSchema, type Schema } from './schema.js';

/**
 * Define a typed configuration file. Identity at runtime — the value exists
 * for type inference, giving apps full completion on `config.get('app.x')`
 * when the config file is typed.
 *
 * ```ts
 * // config/app.ts
 * export default defineConfig({
 *   name: 'my-cli',
 *   env: env('APP_ENV', 'production'),
 * });
 * ```
 */
export function defineConfig<T extends Record<string, unknown>>(config: T): T;
/**
 * Define a validated configuration file. The schema runs immediately, so a
 * bad config fails at import time with every offending key listed.
 *
 * ```ts
 * export default defineConfig(s.object({ url: s.string(), pool: s.number().default(5) }), {
 *   url: env('DATABASE_URL', 'sqlite:///local.db'),
 * });
 * ```
 */
export function defineConfig<T>(schema: Schema<T>, config: unknown): T;
export function defineConfig<T>(schemaOrConfig: Schema<T> | T, config?: unknown): T {
  if (isSchema(schemaOrConfig)) {
    return assertSchema(schemaOrConfig, config);
  }
  return schemaOrConfig;
}

function isSchema<T>(value: Schema<T> | unknown): value is Schema<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Schema<T>).parse === 'function' &&
    typeof (value as Schema<T>).type === 'string'
  );
}
