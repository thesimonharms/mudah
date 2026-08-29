export { run, type RunOptions } from './run.js';
export { createWatcher, type WatcherOptions } from './watcher.js';

// App-facing re-exports: `import { Command } from '@mudah-cli/mudah'` is all users need.
export { Command } from '@mudah-cli/console';
export {
  Application,
  EventBus,
  ServiceProvider,
  UsageError,
  ExitError,
  CommandCancelled,
  checkForUpdate,
  clearUpdateCache,
  compareSemVer,
  discoverPlugins,
  findPluginPackages,
  formatUpdateNudge,
  loadManifest,
  loadPlugin,
  parseSemVer,
  type MudahManifest,
  type LazyProviderOptions,
  type PluginDiscoveryOptions,
  type PluginInfo,
  type ProviderClass,
  type AppEvents,
  type UpdateCheckOptions,
  type UpdateCheckResult,
} from '@mudah-cli/core';
export {
  ConfigRepository,
  ConfigValidationError,
  assertSchema,
  defineConfig,
  env,
  loadEnvFile,
  loadConfigFiles,
  s,
  validateSchema,
  type Schema,
  type SchemaIssue,
  type SchemaResult,
} from '@mudah-cli/config';
export { Container } from '@mudah-cli/container';
export { detectCapabilities, type TerminalCapabilities } from '@mudah-cli/terminal';
