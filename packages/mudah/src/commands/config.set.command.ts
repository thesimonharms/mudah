import { Command } from '@mudah-cli/console';
import { schemaAt, validateSchema } from '@mudah-cli/config';

/** Built-in `config:set {key} {value}` command. */
export default class ConfigSetCommand extends Command {
  signature = 'config:set {key} {value}';
  description = 'Set a config value (dotted key)';

  async handle() {
    const key = this.arg('key');
    const value = this.arg('value');
    if (!key || value === undefined) {
      this.output.error('Usage: config:set {key} {value}');
      return 1;
    }

    // Best-effort coercion: numbers/booleans/JSON literals become their typed
    // form so `config:set app.port 8080` doesn't store the string "8080".
    const coerced = coerceLiteral(value);

    const schema = this.app.config().schema;
    if (schema !== undefined) {
      const node = schemaAt(schema, key);
      if (node === undefined) {
        this.output.error(`Unknown config key "${key}".`);
        this.output.hint('Only keys declared in the bound schema can be set.');
        return 1;
      }
      const result = validateSchema(node, coerced, key);
      if (!result.ok) {
        this.output.error(`Invalid value for ${key}:`);
        for (const issue of result.issues) {
          this.output.hint(`${issue.path || key}: ${issue.message}`);
        }
        return 1;
      }
    }

    this.app.config().set(key, coerced);
    if (this.output.isMachineReadable) {
      this.output.emit('data', 'config', { key, value: coerced });
    } else {
      this.output.success(`Set ${key} = ${JSON.stringify(coerced)}`);
    }
    return 0;
  }
}

function coerceLiteral(raw: string): string | number | boolean | null {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (raw === '') return '';
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return raw;
}
