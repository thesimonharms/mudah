import { Command } from '@mudah-cli/mudah';
import { runPlayground } from '../playground.js';

export default class PlayCommand extends Command {
  signature = 'play';
  description = 'Open the live sine playground (OS mixer, key-up energy)';

  async handle(): Promise<number> {
    return runPlayground(process.stdout, process.stdin);
  }
}
