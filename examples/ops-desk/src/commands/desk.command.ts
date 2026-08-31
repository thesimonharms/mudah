import { Command } from '@mudah-cli/mudah';
import { Program } from '@mudah-cli/mudah/tui';
import { OpsDesk } from '../desk.js';
import { requireTty } from '../tty.js';

export default class DeskCommand extends Command {
  signature = 'desk';
  description = 'Open the ops desk';

  async handle(): Promise<number> {
    const blocked = requireTty(this.output, 'Use: ops-desk env staging   or   ops-desk ship production');
    if (blocked !== undefined) return blocked;

    const desk = new OpsDesk({ env: this.app.config().get<string>('app.env', 'staging') });
    const program = new Program({ mouse: true });
    program.mount(desk.root);
    const code = await program.run();
    if (code === 0) this.output.success(`Desk closed. env=${desk.state.env} region=${desk.state.region}`);
    return code;
  }
}
