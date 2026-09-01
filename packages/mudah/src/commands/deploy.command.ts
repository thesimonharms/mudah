import { Command } from '@mudah-cli/console';
import { buildDeployPlan, executeDeployPlan, parseHosts, type HostProbe } from '../deploy.js';

/**
 * Built-in `deploy` command: multi-host rolling or parallel plan.
 * `--execute` runs injectable health probes (default dry-run, no SSH).
 */
export default class DeployCommand extends Command {
  signature = 'deploy {host=localhost} [--rolling] [--execute]';
  description = 'Plan (and optionally probe) a multi-host deploy';
  static exitCodes = { 1: 'A host probe failed during --execute' };

  async handle(): Promise<number> {
    const hosts = parseHosts(this.arg('host'));
    const rolling = this.option('rolling') === true;
    const execute = this.option('execute') === true;
    const plan = buildDeployPlan(hosts, rolling, !execute);

    this.output.section('Deploy plan');
    this.output.keyValue('mode', plan.mode);
    this.output.keyValue('hosts', String(plan.hosts.length));
    this.output.keyValue('dry-run', plan.dryRun ? 'yes' : 'no');
    for (const entry of plan.hosts) {
      const wave = plan.mode === 'rolling' ? `wave ${entry.wave}/${plan.hosts.length}` : 'parallel';
      this.output.raw(`  ${entry.host}  (${wave})\n`);
    }

    const probe = this.app.has('deploy.probe') ? this.app.make<HostProbe>('deploy.probe') : undefined;
    const { results } = await executeDeployPlan(plan, probe);
    if (execute) {
      for (const result of results) {
        const line = `${result.host}  ${result.ok ? 'ok' : 'fail'}  ${result.latencyMs}ms`;
        this.output.raw(`  ${line}${result.detail ? `  ${result.detail}` : ''}\n`);
      }
      if (results.some((result) => !result.ok)) return 1;
    } else {
      this.output.muted('No SSH — this is a plan only.');
    }
    this.output.success('deploy plan ready');
    return 0;
  }
}
