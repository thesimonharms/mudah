import { Command } from '@mudah-cli/console';
import { redactSecrets, type RedactOptions } from '@mudah-cli/config';

/** Built-in `config:show {key?}` command. */
export default class ConfigShowCommand extends Command {
  signature = 'config:show {key?}';
  description = 'Dump configuration (secrets are redacted by default)';

  async handle() {
    const cfg = this.app.config();
    const key = this.arg('key');
    const opts: RedactOptions = {};

    if (key) {
      if (!cfg.has(key)) {
        this.output.error(`No configuration at key "${key}".`);
        return 1;
      }
      const leaf = key.split('.').pop()!;
      const value = cfg.get(key);
      const redacted = redactSecrets({ [leaf]: value }, opts) as Record<string, unknown>;
      const result = redacted[leaf];
      if (this.output.isMachineReadable) {
        this.output.emit('data', 'config', { key, value: result });
      } else {
        this.output.keyValue(key, JSON.stringify(result));
      }
      return;
    }

    const tree = redactSecrets(cfg.all(), opts);
    if (this.output.isMachineReadable) {
      this.output.emit('data', 'config', tree);
    } else {
      this.output.raw(JSON.stringify(tree, null, 2));
    }
  }
}
