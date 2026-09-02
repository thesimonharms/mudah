import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from '@mudah-cli/console';
import { stageSandboxTree, withSandbox } from '../sandbox.js';

/**
 * Built-in `sandbox` command: copy the app into a temp tree, allowlist env,
 * block network, reject writes outside that tree, then run the command
 * against the copy.
 */
export default class SandboxCommand extends Command {
  signature = 'sandbox {command?}';
  description = 'Run a command in an isolated cwd with network disabled';

  async handle(): Promise<number> {
    const from = this.app.basePath;
    const tmp = await mkdtemp(join(tmpdir(), 'mudah-sandbox-'));
    const copied = stageSandboxTree(from, tmp);
    this.output.section('Sandbox');
    this.output.keyValue('cwd', tmp);
    this.output.keyValue('copied', copied.length > 0 ? copied.join(', ') : '(none)');
    this.output.keyValue('env', 'MUDAH_SANDBOX=1 MUDAH_NO_FETCH=1');

    const target = this.arg('command');
    if (target === undefined) {
      this.output.hint('Pass a command to run, e.g. sandbox hello');
      return 0;
    }

    const { run } = await import('../run.js');
    return withSandbox({ cwd: tmp }, () =>
      run({
        cwd: tmp,
        argv: [target],
        stdout: { write: (data: string) => this.output.write(String(data)) },
        stderr: { write: (data: string) => this.output.write(String(data)) },
        allowThemeQuery: false,
        disablePlugins: true,
      }),
    );
  }
}
