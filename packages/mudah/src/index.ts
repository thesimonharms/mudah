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
  loadManifest,
  type MudahManifest,
  type LazyProviderOptions,
  type ProviderClass,
  type AppEvents,
} from '@mudah-cli/core';
export { ConfigRepository, defineConfig, env, loadEnvFile, loadConfigFiles } from '@mudah-cli/config';
export { Container } from '@mudah-cli/container';
export { detectCapabilities, type TerminalCapabilities } from '@mudah-cli/terminal';
