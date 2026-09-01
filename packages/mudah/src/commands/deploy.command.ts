import { Command } from '@mudah-cli/console';

/**
 * Built-in `deploy` command: print a multi-host plan. No SSH.
 * Multiple hosts: comma-separated `{host}` (e.g. `a.example,b.example`).
 */
export default class DeployCommand extends Command {
  signature = 'deploy {host=localhost} [--rolling]';
  description = 'Print a deployment plan (no real SSH)';

  async handle(): Promise<number> {
    const raw = String(this.arg('host') ?? 'localhost');
    const parsed = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
    const hosts = parsed.length > 0 ? parsed : ['localhost'];
    const rolling = this.option('rolling') === true;

    this.output.section('Deploy plan');
    this.output.keyValue('mode', rolling ? 'rolling' : 'all-at-once');
    this.output.keyValue('hosts', String(hosts.length));
    for (const [i, host] of hosts.entries()) {
      const wave = rolling ? `wave ${i + 1}/${hosts.length}` : 'parallel';
      this.output.raw(`  ${host}  (${wave})\n`);
    }
    this.output.muted('No SSH — this is a plan only.');
    this.output.success('deploy plan ready');
    return 0;
  }
}
