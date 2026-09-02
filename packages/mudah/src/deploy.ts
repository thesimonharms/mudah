import { spawnSync } from 'node:child_process';

export interface DeployHost {
  readonly host: string;
  readonly wave: number;
}

export interface DeployPlan {
  readonly mode: 'rolling' | 'all-at-once';
  readonly hosts: DeployHost[];
  readonly dryRun: boolean;
  /** Remote command run over SSH after a successful probe. */
  readonly remote?: string;
}

export interface HostProbe {
  (host: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface HostRun {
  (host: string, command: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface DeployResult {
  readonly plan: DeployPlan;
  readonly results: Array<{ host: string; ok: boolean; latencyMs: number; detail?: string }>;
}

const HOST_RE = /^[A-Za-z0-9.:\[\]_-]+$/;
const REMOTE_RE = /^[\w./:=@+, \t'"%*-]+$/;

export function validateHost(host: string): string {
  const trimmed = host.trim();
  if (trimmed.length === 0 || !HOST_RE.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`[deploy] Invalid host "${host}".`);
  }
  return trimmed;
}

/** Reject empty remote strings and shell metacharacters that are not needed for a restart/rsync command. */
export function validateRemote(command: string): string {
  const trimmed = command.trim();
  if (trimmed.length === 0) throw new Error('[deploy] Remote command is empty.');
  if (trimmed.length > 512) throw new Error('[deploy] Remote command is too long.');
  if (!REMOTE_RE.test(trimmed)) {
    throw new Error('[deploy] Remote command has characters that are not allowed.');
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

export function buildDeployPlan(
  hosts: readonly string[],
  rolling: boolean,
  dryRun = true,
  remote?: string,
): DeployPlan {
  return {
    mode: rolling ? 'rolling' : 'all-at-once',
    dryRun,
    ...(remote !== undefined ? { remote: validateRemote(remote) } : {}),
    hosts: hosts.map((host, i) => ({ host: validateHost(host), wave: rolling ? i + 1 : 1 })),
  };
}

const SSH_BASE = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=accept-new'] as const;

function sshResult(
  args: readonly string[],
): { ok: boolean; latencyMs: number; detail?: string } {
  const started = Date.now();
  const result = spawnSync('ssh', [...args], { encoding: 'utf8', timeout: 8_000 });
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

/** SSH BatchMode probe. Injectable for tests via `executeDeployPlan`. */
export async function defaultSshProbe(host: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const safe = validateHost(host);
  const probed = sshResult([...SSH_BASE, safe, 'true']);
  return { ...probed, detail: probed.ok ? 'ssh probe' : probed.detail };
}

/** Run `command` on `host` with SSH BatchMode. */
export async function defaultSshRun(host: string, command: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const safe = validateHost(host);
  const remote = validateRemote(command);
  const ran = sshResult([...SSH_BASE, safe, '--', remote]);
  return { ...ran, detail: ran.ok ? `ssh ${remote}` : ran.detail };
}

export interface ExecuteDeployOptions {
  probe?: HostProbe;
  run?: HostRun;
}

export async function executeDeployPlan(plan: DeployPlan, options?: HostProbe | ExecuteDeployOptions): Promise<DeployResult> {
  const probe: HostProbe | undefined = typeof options === 'function' ? options : options?.probe;
  const run: HostRun | undefined = typeof options === 'function' ? undefined : options?.run;
  const results: DeployResult['results'] = [];
  if (plan.dryRun) {
    for (const entry of plan.hosts) {
      const detail = plan.remote ? `dry-run ${plan.remote}` : 'dry-run';
      results.push({ host: entry.host, ok: true, latencyMs: 0, detail });
    }
    return { plan, results };
  }

  if (!probe) {
    throw new Error('[deploy] --execute requires a host probe (bind deploy.probe or use the default SSH probe).');
  }

  const visit = async (host: string): Promise<DeployResult['results'][number]> => {
    const probed = await probe(host);
    if (!probed.ok || plan.remote === undefined) {
      return { host, ...probed };
    }
    const exec = run ?? defaultSshRun;
    const ran = await exec(host, plan.remote);
    return {
      host,
      ok: ran.ok,
      latencyMs: probed.latencyMs + ran.latencyMs,
      detail: `${probed.detail ?? 'probe'}; ${ran.detail ?? 'run'}`,
    };
  };

  if (plan.mode === 'all-at-once') {
    const batch = await Promise.all(plan.hosts.map((entry) => visit(entry.host)));
    return { plan, results: batch };
  }

  for (const entry of plan.hosts) {
    const row = await visit(entry.host);
    results.push(row);
    if (!row.ok) break;
  }
  return { plan, results };
}
