import { Command } from '@mudah-cli/mudah';

const ENVIRONMENTS = ['staging', 'production'] as const;

/** `deploy run <env>` — grouped command in the `deploy` namespace. */
export default class DeployRunCommand extends Command {
  signature = 'deploy:run {environment} [--dry-run] [--replicas=]';
  description = 'Deploy a specific environment';
  groupDescription = 'Deploy the application';

  async handle(): Promise<number> {
    const environment = this.arg('environment') ?? 'staging';
    if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
      this.output.error(`Unknown environment "${environment}".`);
      this.output.muted(`Expected one of: ${ENVIRONMENTS.join(', ')}`);
      return 2;
    }

    const target = this.app.config().get<{ host: string; replicas: number } | undefined>(
      `deploy.environments.${environment}`,
    );
    if (target === undefined) {
      this.output.error(`No configuration for environment "${environment}".`);
      return 1;
    }

    const replicas = Number(this.option('replicas') ?? target.replicas);
    const dryRun = this.option('dry-run') === true;

    this.output.section(`${dryRun ? 'Planning' : 'Deploying'} ${environment}`);
    this.output.raw(`  host       ${target.host}\n`);
    this.output.raw(`  replicas   ${replicas}\n`);

    if (dryRun) {
      this.output.warn('Dry run — nothing was deployed.');
      return 0;
    }

    this.output.success(`Deployed ${replicas} replica(s) to ${environment}.`);
    this.output.notification('Deploy', `${environment} is live`);
    return 0;
  }
}
