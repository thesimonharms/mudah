import { ServiceProvider, s } from '@mudah-cli/mudah';

export interface DeployTarget {
  readonly host: string;
  readonly port: number;
  readonly replicas: number;
}

/** Load `config/deploy.ts` (already schema-validated) and merge it in. */
export default class DeployProvider extends ServiceProvider {
  async register(): Promise<void> {
    await this.mergeConfigFrom('config/deploy.ts', 'deploy');

    // The config is validated on import, but re-check it here: an app can
    // override `deploy.*` at runtime, and this catches that too.
    const result = this.app.config().validate('deploy', deploySchema);
    if (!result.ok) {
      const first = result.issues[0];
      throw new Error(
        `Invalid deploy configuration: ${result.issues.length} problem(s), first at "${first?.path}" — ${first?.message}`,
      );
    }

    this.app.singleton('deploy.targets', () => this.app.config().get('deploy.environments'));
  }

  boot(): void {
    this.app.events().on('command.after', (event) => {
      if (event.durationMs > 1000) {
        this.app.config().set('deploy.lastSlowCommand', event.command);
      }
    });
  }
}

/** Kept in sync with `config/deploy.ts` for runtime overrides. */
export const deploySchema = s.object({
  defaultEnvironment: s.enum(['staging', 'production'] as const).default('staging'),
  environments: s.object({
    staging: s.object({
      host: s.string().min(1),
      port: s.number().int().default(22),
      replicas: s.number().int().default(1),
    }),
    production: s.object({
      host: s.string().min(1),
      port: s.number().int().default(22),
      replicas: s.number().int().default(3),
    }),
  }),
  timeouts: s.object({
    connect: s.number().default(5),
    drain: s.number().default(30),
  }),
});
