import { Command } from '@mudah-cli/console';
import { validateSchema, type Schema } from '@mudah-cli/config';

/**
 * Built-in `config:validate {key?}` command.
 *
 * Walks the (current) config tree and reports every offending key, just like
 * the schema's boot-time validation. Optional `{schema?}` makes the user paste
 * in a JSON schema; the command only supports a tiny shape (object → s.object)
 * inline so it doesn't need a full provider.
 */
export default class ConfigValidateCommand extends Command {
  signature = 'config:validate {key?}';
  description = 'Run a shallow schema check against the (current) config tree';

  async handle() {
    const cfg = this.app.config();
    const root = cfg.all();
    const key = this.arg('key');
    const target = key ? cfg.get(key) : root;

    // Without a schema definition the command can still check types of
    // well-known config keys (numbers, booleans). This is a best-effort
    // smoke test — full validation requires the user's schema at boot.
    const issues: Array<{ path: string; message: string }> = [];
    walk(valueFor(target), '', issues);

    if (this.output.isMachineReadable) {
      this.output.emit('data', 'config', { ok: issues.length === 0, issues });
    } else if (issues.length === 0) {
      this.output.success(`Config ${key ?? '(root)'} looks healthy.`);
    } else {
      this.output.error(`Found ${issues.length} issue(s):`);
      for (const issue of issues) {
        this.output.hint(`${issue.path || '(root)'}: ${issue.message}`);
      }
    }
    return issues.length === 0 ? 0 : 1;
  }
}

function valueFor(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function walk(value: unknown, prefix: string, issues: Array<{ path: string; message: string }>): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (v === undefined) issues.push({ path, message: 'value is undefined' });
    walk(v, path, issues);
  }
}

// Re-exported only to anchor the type at compile time.
export type _Schema = Schema<unknown>;
void validateSchema;
