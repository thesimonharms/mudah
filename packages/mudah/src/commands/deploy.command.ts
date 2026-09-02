import { Command } from '@mudah-cli/console';
import {
  buildDeployPlan,
  defaultSshProbe,
  defaultSshRun,
  executeDeployPlan,
  parseHosts,
  type HostProbe,
  type HostRun,
} from '../deploy.js';

/**
 * Built-in `deploy` command: multi-host rolling or parallel SSH probe, then
 * an optional remote command. Default is a plan-only dry-run. `--execute`
 * probes (bound `deploy.probe`, or SSH BatchMode). `--remote=` runs that
 * command on each host after a successful probe.
 */
export default class DeployCommand extends Command {
  signature = 'deploy {host=localhost} [--rolling] [--execute] [--remote=]';
  description = 'Plan (and optionally probe/run over SSH) a multi-host deploy';
  static exitCodes = { 1: 'A host probe or remote command failed during --execute' };

  async handle(): Promise<number> {
    const hosts = parseHosts(this.arg('host'));
    const rolling = this.option('rolling') === true;
    const execute = this.option('execute') === true;
    const remoteRaw = this.option('remote');
    const remote = typeof remoteRaw === 'string' && remoteRaw.length > 0 ? remoteRaw : undefined;
    const plan = buildDeployPlan(hosts, rolling, !execute, remote);

    this.output.section('Deploy plan');
    this.output.keyValue('mode', plan.mode);
    this.output.keyValue('hosts', String(plan.hosts.length));
    this.output.keyValue('dry-run', plan.dryRun ? 'yes' : 'no');
    if (plan.remote) this.output.keyValue('remote', plan.remote);
    for (const entry of plan.hosts) {
      const wave = plan.mode === 'rolling' ? `wave ${entry.wave}/${plan.hosts.length}` : 'parallel';
      this.output.raw(`  ${entry.host}  (${wave})\n`);
    }

    if (!execute) {
      this.output.muted(
        plan.remote
          ? 'No SSH — this is a plan only. Pass --execute to probe hosts and run the remote command.'
          : 'No SSH — this is a plan only. Pass --execute to probe hosts, and --remote=cmd to run a command.',
      );
      this.output.success('deploy plan ready');
      return 0;
    }

    const probe: HostProbe = this.app.has('deploy.probe')
      ? this.app.make<HostProbe>('deploy.probe')
      : defaultSshProbe;
    const run: HostRun | undefined = this.app.has('deploy.run')
      ? this.app.make<HostRun>('deploy.run')
      : plan.remote
        ? defaultSshRun
        : undefined;
    const { results } = await executeDeployPlan(plan, { probe, run });
    for (const result of results) {
      const line = `${result.host}  ${result.ok ? 'ok' : 'fail'}  ${result.latencyMs}ms`;
      this.output.raw(`  ${line}${result.detail ? `  ${result.detail}` : ''}\n`);
    }
    if (results.some((result) => !result.ok)) return 1;
    this.output.success('deploy complete');
    return 0;
  }
}
