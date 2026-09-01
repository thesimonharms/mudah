import { Command } from '@mudah-cli/console';
import {
  formatPrecedence,
  redactSecrets,
  type PrecedenceRow,
} from '@mudah-cli/config';

/** Built-in `config:source {key?}` command. */
export default class ConfigSourceCommand extends Command {
  signature = 'config:source {key?}';
  description = 'Show which layer a config key resolved from (secrets are redacted)';

  async handle() {
    const cfg = this.app.config();
    const key = this.arg('key');

    let rows: PrecedenceRow[];
    if (key) {
      const source = cfg.source(key);
      if (source === undefined) {
        this.output.error(`No configuration at key "${key}".`);
        return 1;
      }
      rows = [{ key, layer: source.layer, value: source.value }];
    } else {
      rows = cfg.precedence();
    }

    const redacted = rows.map(redactRow);
    if (this.output.isMachineReadable) {
      this.output.emit('data', 'config', key ? redacted[0] : redacted);
      return 0;
    }

    const lines = formatPrecedence(redacted);
    if (lines.length === 0) {
      this.output.success('No configuration keys recorded.');
      return 0;
    }
    this.output.raw(lines.join('\n'));
    return 0;
  }
}

function redactRow(row: PrecedenceRow): PrecedenceRow {
  const leaf = row.key.split('.').pop()!;
  const redacted = redactSecrets({ [leaf]: row.value }) as Record<string, unknown>;
  return { key: row.key, layer: row.layer, value: redacted[leaf] };
}
