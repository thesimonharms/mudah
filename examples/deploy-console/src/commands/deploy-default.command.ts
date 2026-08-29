import { Command } from '@mudah-cli/mudah';

/** Bare `deploy` runs this: the group's default command. */
export default class DeployDefaultCommand extends Command {
  signature = 'deploy:default';
  description = 'Deploy to the default environment';
  groupDescription = 'Deploy the application';

  async handle(): Promise<number> {
    const environment = this.app.config().get<string>('deploy.defaultEnvironment', 'staging');
    this.output.section(`Deploying ${environment}`);

    const target = this.app.config().get<{ host: string; replicas: number }>(
      `deploy.environments.${environment}`,
    );
    this.output.raw(`  host       ${target?.host ?? 'unknown'}\n`);
    this.output.raw(`  replicas   ${target?.replicas ?? 1}\n`);
    this.output.success(`Deployed ${environment}.`);
    return 0;
  }
}
