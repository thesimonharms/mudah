import { CommandCancelled, ExitError, UsageError } from '@mudah-cli/core';
import type { Output } from '@mudah-cli/ui';

/**
 * Render a thrown error through the styled output and return the process
 * exit code it maps to. Shared by the `@mudah-cli/mudah` umbrella and the test harness
 * so both render failures identically.
 */
export function renderError(error: unknown, output: Output): number {
  if (error instanceof UsageError) {
    output.error(error.message);
    if (error.usage) output.hint(`Usage: ${error.usage}`);
    if (error.hint) output.hint(error.hint);
    return 2;
  }
  if (error instanceof CommandCancelled) {
    return 130;
  }
  if (error instanceof ExitError) {
    if (error.message) output.error(error.message);
    return error.code;
  }
  output.error(error instanceof Error ? error.message : String(error));
  if (process.env['MUDAH_DEBUG']) {
    output.error(error instanceof Error ? (error.stack ?? '') : '');
  }
  return 1;
}
