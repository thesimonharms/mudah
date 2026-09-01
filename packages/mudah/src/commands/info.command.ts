import { Command } from '@mudah-cli/console';

/** Built-in `info` command: dump runtime, app, and config info. */
export default class InfoCommand extends Command {
  signature = 'info';
  description = 'Show runtime, app, and config information';

  async handle() {
    const app = this.app;
    const output = this.output;

    output.section('Runtime');
    output.keyValue('node', process.version);
    output.keyValue('platform', `${process.platform} ${process.arch}`);

    output.section('Application');
    output.keyValue('name', app.manifest.name);
    output.keyValue('version', app.manifest.version);
    output.keyValue('basePath', app.basePath);
    output.keyValue('bin', app.manifest.bin);

    const configKeys = Object.keys(app.config().all());
    if (configKeys.length > 0) {
      output.section('Configuration');
      for (const key of configKeys) {
        output.keyValue(key, String(app.config().get(key)));
      }
    }

    output.line();
    output.success('info complete');
  }
}
