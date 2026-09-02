import { Command } from '@mudah-cli/console';
import {
  buildDeployPlan,
  defaultSshProbe,
  executeDeployPlan,
  parseHosts,
  type HostProbe,
} from '../deploy.js';

/**
 * Built-in `deploy` command: multi-host rolling or parallel SSH probes.
 * Default is a plan-only dry-run. `--execute` runs probes (bound
 * `deploy.probe`, or SSH BatchMode).
 */
export default class DeployCommand extends Command {
  signature = 'deploy {host=localhost} [--rolling] [--execute]';
  description = 'Plan (and optionally probe over SSH) a multi-host deploy';
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

    if (!execute) {
      this.output.muted('No SSH — this is a plan only. Pass --execute to probe hosts.');
      this.output.success('deploy plan ready');
      return 0;
    }

    const probe: HostProbe = this.app.has('deploy.probe')
      ? this.app.make<HostProbe>('deploy.probe')
      : defaultSshProbe;
    const { results } = await executeDeployPlan(plan, probe);
    for (const result of results) {
      const line = `${result.host}  ${result.ok ? 'ok' : 'fail'}  ${result.latencyMs}ms`;
      this.output.raw(`  ${line}${result.detail ? `  ${result.detail}` : ''}\n`);
    }
    if (results.some((result) => !result.ok)) return 1;
    this.output.success('deploy complete');
    return 0;
  }
}
