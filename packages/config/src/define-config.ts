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
export function defineConfig<T extends Record<string, unknown>>(config: T): T {
  return config;
}
