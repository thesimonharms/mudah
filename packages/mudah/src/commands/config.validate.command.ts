import { Command } from '@mudah-cli/console';
import { schemaAt, validateSchema, type Schema } from '@mudah-cli/config';

/**
 * Built-in `config:validate {key?}` command.
 *
 * When a schema is bound on `app.config()`, this runs `validateSchema` and
 * reports every offending key. Without a schema the command falls back to a
 * shallow walk that flags `undefined` values.
 */
export default class ConfigValidateCommand extends Command {
  signature = 'config:validate {key?}';
  description = 'Run a schema check against the (current) config tree';

  async handle() {
    const cfg = this.app.config();
    const key = this.arg('key');
    const issues = collectIssues(cfg.schema, cfg.all(), key, (k) => cfg.get(k));

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

function collectIssues(
  schema: Schema<unknown> | undefined,
  root: Record<string, unknown>,
  key: string | undefined,
  get: (key: string) => unknown,
): Array<{ path: string; message: string }> {
  if (schema !== undefined) {
    if (key) {
      const node = schemaAt(schema, key);
      if (node === undefined) return [{ path: key, message: 'is not a known key' }];
      return [...validateSchema(node, get(key), key).issues];
    }
    return [...validateSchema(schema, root).issues];
  }

  const issues: Array<{ path: string; message: string }> = [];
  const target = key ? get(key) : root;
  walk(valueFor(target), key ?? '', issues);
  return issues;
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
