import { Command } from '@mudah-cli/mudah';
import { runPlayground } from '../playground.js';

export default class PlayCommand extends Command {
  signature = 'play';
  description = 'Play public-domain melodies through the OS mixer';

  async handle(): Promise<number> {
    return runPlayground(process.stdout, process.stdin);
  }
}
