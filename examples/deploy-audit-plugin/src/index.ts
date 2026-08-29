import { Command, ServiceProvider } from '@mudah-cli/mudah';

export interface AuditEntry {
  readonly at: string;
  readonly environment: string;
  readonly replicas: number;
}

const HISTORY: readonly AuditEntry[] = [
  { at: '2026-08-28T18:00:00Z', environment: 'staging', replicas: 1 },
  { at: '2026-08-28T20:12:00Z', environment: 'production', replicas: 3 },
];

/** Binds the in-memory audit log the `audit:last` command reads. */
export class AuditProvider extends ServiceProvider {
  register(): void {
    this.app.singleton('audit.log', () => HISTORY);
  }
}

/** `audit last` — a command the host app never declared itself. */
export class AuditLastCommand extends Command {
  signature = 'audit:last';
  description = 'Show the most recent deployment recorded by the audit plugin';
  groupDescription = 'Audit trail (plugin)';

  async handle(): Promise<number> {
    const log = this.app.make<readonly AuditEntry[]>('audit.log');
    const last = log.at(-1);
    if (last === undefined) {
      this.output.warn('No deployments recorded.');
      return 0;
    }

    this.output.section('Last deploy');
    this.output.raw(`  at           ${last.at}\n`);
    this.output.raw(`  environment  ${last.environment}\n`);
    this.output.raw(`  replicas     ${last.replicas}\n`);
    this.output.muted('Recorded by @thesimonharms/deploy-audit');
    return 0;
  }
}

export const providers = [AuditProvider];
export const commands = [AuditLastCommand];
