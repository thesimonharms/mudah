import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command, type ConsoleKernel } from '@mudah-cli/console';
import { withSandbox } from '../sandbox.js';

/**
 * Built-in `sandbox` command: chdir into a temp dir, allowlist env, and
 * block `fetch`. Restores process state afterwards.
 */
export default class SandboxCommand extends Command {
  signature = 'sandbox {command?}';
  description = 'Run a command in an isolated cwd with network disabled';

  constructor(private readonly kernel: ConsoleKernel) {
    super();
  }

  async handle(): Promise<number> {
    const tmp = await mkdtemp(join(tmpdir(), 'mudah-sandbox-'));
    this.output.section('Sandbox');
    this.output.keyValue('cwd', tmp);
    this.output.keyValue('env', 'MUDAH_SANDBOX=1 MUDAH_NO_FETCH=1');

    const target = this.arg('command');
    if (target === undefined) {
      this.output.hint('Pass a command to run, e.g. sandbox hello');
      return 0;
    }
    if (!this.kernel.has(target)) {
      throw this.usageError(`Unknown command "${target}".`, 'Run "help" to list all commands.');
    }

    return withSandbox({ cwd: tmp }, () => this.kernel.dispatch([target]));
  }
}
