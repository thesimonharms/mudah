import { Command } from '@mudah-cli/mudah';
import { Form, Program } from '@mudah-cli/mudah/tui';
import { flagSchema } from '../data.js';
import { requireTty } from '../tty.js';

export default class FlagsCommand extends Command {
  signature = 'flags [--canary] [--region=]';
  description = 'Edit feature flags';

  async handle(): Promise<number> {
    const region = this.option<string>('region');
    const canaryFlag = this.option('canary') === true;
    if (region) {
      this.output.success(`flags region=${region} canary=${String(canaryFlag)}`);
      return 0;
    }

    const blocked = requireTty(this.output, 'Use: ops-desk flags --region=iad --canary');
    if (blocked !== undefined) return blocked;

    const form = Form.fromSchema(flagSchema());
    const program = new Program();
    form.attach(program);
    const code = await program.run();
    const result = form.result();
    if (result) this.output.success(`flags region=${String(result.region)} canary=${String(result.canary)}`);
    return code;
  }
}
