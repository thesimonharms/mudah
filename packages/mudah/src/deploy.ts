export interface DeployHost {
  readonly host: string;
  readonly wave: number;
}

export interface DeployPlan {
  readonly mode: 'rolling' | 'all-at-once';
  readonly hosts: DeployHost[];
  readonly dryRun: boolean;
}

export interface HostProbe {
  (host: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface DeployResult {
  readonly plan: DeployPlan;
  readonly results: Array<{ host: string; ok: boolean; latencyMs: number; detail?: string }>;
}

export function parseHosts(raw: string | undefined): string[] {
  const parsed = String(raw ?? 'localhost')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parsed.length > 0 ? parsed : ['localhost'];
}

export function buildDeployPlan(hosts: readonly string[], rolling: boolean, dryRun = true): DeployPlan {
  return {
    mode: rolling ? 'rolling' : 'all-at-once',
    dryRun,
    hosts: hosts.map((host, i) => ({ host, wave: rolling ? i + 1 : 1 })),
  };
}

export async function executeDeployPlan(plan: DeployPlan, probe?: HostProbe): Promise<DeployResult> {
  const results: DeployResult['results'] = [];
  if (plan.dryRun || !probe) {
    for (const entry of plan.hosts) {
      results.push({ host: entry.host, ok: true, latencyMs: 0, detail: 'dry-run' });
    }
    return { plan, results };
  }

  if (plan.mode === 'all-at-once') {
    const batch = await Promise.all(
      plan.hosts.map(async (entry) => {
        const probed = await probe(entry.host);
        return { host: entry.host, ...probed };
      }),
    );
    return { plan, results: batch };
  }

  for (const entry of plan.hosts) {
    const probed = await probe(entry.host);
    results.push({ host: entry.host, ...probed });
    if (!probed.ok) break;
  }
  return { plan, results };
}
