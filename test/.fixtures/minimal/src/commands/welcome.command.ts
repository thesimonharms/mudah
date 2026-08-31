import { Command } from '@mudah-cli/mudah';

export default class WelcomeCommand extends Command {
  signature = 'welcome {name?}';
  description = 'Say hello from minimal';

  async handle() {
    this.output.section('Mudah');
    this.output.success(`Hello, ${this.arg('name') ?? 'world'}!`);
  }
}
