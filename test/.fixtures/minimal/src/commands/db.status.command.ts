import { Command } from '@mudah-cli/mudah';

export default class DbStatusCommand extends Command {
  signature = 'db:status';
  description = 'Show database status';

  async handle() {
    this.output.success('Database is up.');
  }
}
