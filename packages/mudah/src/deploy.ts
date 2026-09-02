import { spawnSync } from 'node:child_process';

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

const HOST_RE = /^[A-Za-z0-9.:\[\]_-]+$/;

export function validateHost(host: string): string {
  const trimmed = host.trim();
  if (trimmed.length === 0 || !HOST_RE.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`[deploy] Invalid host "${host}".`);
  }
  return trimmed;
}

export function parseHosts(raw: string | undefined): string[] {
  const parsed = String(raw ?? 'localhost')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(validateHost);
  return parsed.length > 0 ? parsed : ['localhost'];
}

export function buildDeployPlan(hosts: readonly string[], rolling: boolean, dryRun = true): DeployPlan {
  return {
    mode: rolling ? 'rolling' : 'all-at-once',
    dryRun,
    hosts: hosts.map((host, i) => ({ host: validateHost(host), wave: rolling ? i + 1 : 1 })),
  };
}

/** SSH BatchMode probe. Injectable for tests via `executeDeployPlan`. */
export async function defaultSshProbe(host: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const safe = validateHost(host);
  const started = Date.now();
  const result = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=accept-new', safe, 'true'],
    { encoding: 'utf8', timeout: 8_000 },
  );
  const latencyMs = Date.now() - started;
  if (result.error) {
    return { ok: false, latencyMs, detail: result.error.message };
  }
  if (result.status !== 0) {
    const err = (result.stderr ?? '').trim() || `ssh exit ${String(result.status)}`;
    return { ok: false, latencyMs, detail: err };
  }
  return { ok: true, latencyMs, detail: 'ssh' };
}

export async function executeDeployPlan(plan: DeployPlan, probe?: HostProbe): Promise<DeployResult> {
  const results: DeployResult['results'] = [];
  if (plan.dryRun) {
    for (const entry of plan.hosts) {
      results.push({ host: entry.host, ok: true, latencyMs: 0, detail: 'dry-run' });
    }
    return { plan, results };
  }

  if (!probe) {
    throw new Error('[deploy] --execute requires a host probe (bind deploy.probe or use the default SSH probe).');
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
