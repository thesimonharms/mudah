import { Command } from '@mudah-cli/mudah';

export default class WelcomeCommand extends Command {
  signature = 'welcome {name?}';
  description = 'Say hello from hello-cli';

  async handle() {
    this.output.section('Mudah');
    this.output.success(`Hello, ${this.arg('name') ?? 'world'}!`);
    this.output.muted('Run "hello-cli --help" to see all commands.');
  }
}
