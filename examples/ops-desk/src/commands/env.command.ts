import { Command } from '@mudah-cli/mudah';
import { Program, Screen } from '@mudah-cli/mudah/tui';
import { ENVIRONMENTS } from '../data.js';
import { requireTty } from '../tty.js';

export default class EnvCommand extends Command {
  signature = 'env {name?}';
  description = 'Pick a deploy environment';

  async handle(): Promise<number> {
    const name = this.arg('name');
    if (name) {
      if (!(ENVIRONMENTS as readonly string[]).includes(name)) {
        this.output.error(`Unknown environment "${name}".`);
        this.output.hint(`Use: ${ENVIRONMENTS.join(', ')}`);
        return 2;
      }
      this.output.success(`Using ${name}.`);
      return 0;
    }

    const blocked = requireTty(this.output, 'Use: ops-desk env staging');
    if (blocked !== undefined) return blocked;

    const screen = Screen.picker({ title: 'Environment', items: [...ENVIRONMENTS] });
    const program = new Program();
    screen.attach(program);
    const code = await program.run();
    const picked = screen.result();
    if (picked) this.output.success(`Using ${picked}.`);
    return code;
  }
}
