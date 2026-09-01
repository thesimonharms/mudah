import { Command } from '@mudah-cli/mudah';
import { Program } from '@mudah-cli/mudah/tui';
import { AudioViz } from '../viz.js';

export default class VizCommand extends Command {
  signature = 'viz';
  description = 'Open the audio visualizer (Sparkline + stubbed energy)';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('This command needs an interactive terminal.');
      this.output.hint('Use TestTui in tests, or run viz in a TTY.');
      return 2;
    }
    const viz = new AudioViz();
    const program = new Program();
    program.mount(viz.root);
    const code = await program.run();
    if (viz.result) this.output.success(`band=${viz.result} energy=${viz.energy.toFixed(2)}`);
    return code;
  }
}
