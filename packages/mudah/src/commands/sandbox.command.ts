import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command, type ConsoleKernel } from '@mudah-cli/console';

/**
 * Built-in `sandbox` command: namespace-lite. Sets `MUDAH_SANDBOX=1`
 * and `MUDAH_NO_FETCH=1`, creates a temp cwd, then runs `{command}`.
 * Not a chroot.
 */
export default class SandboxCommand extends Command {
  signature = 'sandbox {command?}';
  description = 'Run a command in a namespace-lite sandbox (temp cwd, no fetch)';

  constructor(private readonly kernel: ConsoleKernel) {
    super();
  }

  async handle(): Promise<number> {
    const tmp = await mkdtemp(join(tmpdir(), 'mudah-sandbox-'));
    process.env['MUDAH_SANDBOX'] = '1';
    process.env['MUDAH_NO_FETCH'] = '1';
    this.output.section('Sandbox');
    this.output.keyValue('cwd', tmp);
    this.output.keyValue('env', 'MUDAH_SANDBOX=1 MUDAH_NO_FETCH=1');
    this.output.muted('namespace-lite — no chroot, no real network isolation');

    const target = this.arg('command');
    if (target === undefined) {
      this.output.hint('Pass a command to run, e.g. sandbox hello');
      return 0;
    }
    if (!this.kernel.has(target)) {
      throw this.usageError(`Unknown command "${target}".`, 'Run "help" to list all commands.');
    }
    return this.kernel.dispatch([target]);
  }
}
