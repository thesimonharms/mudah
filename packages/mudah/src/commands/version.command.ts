import { Command } from '@mudah-cli/console';

/** Built-in `version` command. */
export default class VersionCommand extends Command {
  signature = 'version';
  description = 'Show the application version';

  async handle() {
    this.output.info(`${this.app.manifest.name} v${this.app.manifest.version}`);
  }
}
