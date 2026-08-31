import { Command } from '@mudah-cli/mudah';
import { Program, Screen } from '@mudah-cli/mudah/tui';
import { ENVIRONMENTS, fleet } from '../data.js';
import { requireTty } from '../tty.js';

export default class ShipCommand extends Command {
  signature = 'ship {env?} [--note=]';
  description = 'Walk a ship wizard';

  async handle(): Promise<number> {
    const envArg = this.arg('env');
    const note = this.option<string>('note') ?? '';
    if (envArg) {
      if (!(ENVIRONMENTS as readonly string[]).includes(envArg)) {
        this.output.error(`Unknown environment "${envArg}".`);
        return 2;
      }
      this.output.success(`Shipped to ${envArg}${note ? ` (${note})` : ''}.`);
      return 0;
    }

    const blocked = requireTty(this.output, 'Use: ops-desk ship staging --note=hot-fix');
    if (blocked !== undefined) return blocked;

    const names = fleet().map((s) => s.name);
    const screen = Screen.wizard({
      title: 'Ship',
      steps: [
        { name: 'env', kind: 'pick', items: [...ENVIRONMENTS] },
        { name: 'targets', kind: 'multi', items: names },
        { name: 'note', kind: 'text', label: 'Note' },
      ],
    });
    const program = new Program();
    screen.attach(program);
    const code = await program.run();
    const result = screen.result();
    if (result) this.output.success(JSON.stringify(result));
    return code;
  }
}
