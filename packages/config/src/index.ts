export { ConfigRepository } from './config-repository.js';
export { defineConfig } from './define-config.js';
export { env, loadEnvFile } from './env.js';
export { loadConfigFiles, type LoadConfigOptions } from './load-config-files.js';
export { deepMerge, isPlainObject } from './paths.js';
export {
  assertSchema,
  ConfigValidationError,
  s,
  validateSchema,
  type AnySchemaBuilder,
  type ArraySchemaBuilder,
  type BooleanSchemaBuilder,
  type NumberSchemaBuilder,
  type ObjectShape,
  type ObjectSchemaBuilder,
  type Schema,
  type SchemaIssue,
  type SchemaResult,
  type StringSchemaBuilder,
} from './schema.js';
