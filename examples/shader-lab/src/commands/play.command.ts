import { Command } from '@mudah-cli/mudah';
import { runPlayground } from '../playground.js';

export default class PlayCommand extends Command {
  signature = 'play';
  description = 'Open the live WGSL playground (Kitty graphics, key-up energy)';

  async handle(): Promise<number> {
    return runPlayground(process.stdout, process.stdin);
  }
}
