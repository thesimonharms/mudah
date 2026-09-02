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
  /** Local path copied to each host after a successful probe. */
  readonly source?: string;
  /** Remote path for {@link source}. */
  readonly dest?: string;
}

export interface HostProbe {
  (host: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface HostRun {
  (host: string, command: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface HostCopy {
  (host: string, source: string, dest: string): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface DeployResult {
  readonly plan: DeployPlan;
  readonly results: Array<{ host: string; ok: boolean; latencyMs: number; detail?: string }>;
}

const HOST_RE = /^[A-Za-z0-9.:\[\]_-]+$/;
const REMOTE_RE = /^[\w./:=@+, \t'"%*-]+$/;
const PATH_RE = /^[\w./~-]+$/;

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

/** Local or remote path for rsync. Rejects `..` and shell metacharacters. */
export function validateDeployPath(path: string, label: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) throw new Error(`[deploy] ${label} path is empty.`);
  if (trimmed.split(/[/\\]/).includes('..') || !PATH_RE.test(trimmed)) {
    throw new Error(`[deploy] Invalid ${label} path "${path}".`);
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

export interface BuildDeployPlanOptions {
  remote?: string;
  source?: string;
  dest?: string;
}

export function buildDeployPlan(
  hosts: readonly string[],
  rolling: boolean,
  dryRun = true,
  remoteOrOptions?: string | BuildDeployPlanOptions,
): DeployPlan {
  const extra: BuildDeployPlanOptions =
    typeof remoteOrOptions === 'string' ? { remote: remoteOrOptions } : (remoteOrOptions ?? {});
  const source = extra.source !== undefined ? validateDeployPath(extra.source, 'source') : undefined;
  const dest = extra.dest !== undefined ? validateDeployPath(extra.dest, 'dest') : undefined;
  if ((source === undefined) !== (dest === undefined)) {
    throw new Error('[deploy] --source and --dest must be set together.');
  }
  return {
    mode: rolling ? 'rolling' : 'all-at-once',
    dryRun,
    ...(extra.remote !== undefined ? { remote: validateRemote(extra.remote) } : {}),
    ...(source !== undefined && dest !== undefined ? { source, dest } : {}),
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

/** Copy `source` to `host:dest` with rsync. */
export async function defaultRsyncCopy(
  host: string,
  source: string,
  dest: string,
): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
  const safe = validateHost(host);
  const from = validateDeployPath(source, 'source');
  const to = validateDeployPath(dest, 'dest');
  const started = Date.now();
  const result = spawnSync('rsync', ['-az', '--', from, `${safe}:${to}`], { encoding: 'utf8', timeout: 30_000 });
  const latencyMs = Date.now() - started;
  if (result.error) {
    return { ok: false, latencyMs, detail: result.error.message };
  }
  if (result.status !== 0) {
    const err = (result.stderr ?? '').trim() || `rsync exit ${String(result.status)}`;
    return { ok: false, latencyMs, detail: err };
  }
  return { ok: true, latencyMs, detail: `rsync ${from} -> ${safe}:${to}` };
}

export interface ExecuteDeployOptions {
  probe?: HostProbe;
  run?: HostRun;
  copy?: HostCopy;
}

function joinDetail(...parts: Array<string | undefined>): string | undefined {
  const kept = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return kept.length > 0 ? kept.join('; ') : undefined;
}

export async function executeDeployPlan(plan: DeployPlan, options?: HostProbe | ExecuteDeployOptions): Promise<DeployResult> {
  const probe: HostProbe | undefined = typeof options === 'function' ? options : options?.probe;
  const run: HostRun | undefined = typeof options === 'function' ? undefined : options?.run;
  const copy: HostCopy | undefined = typeof options === 'function' ? undefined : options?.copy;
  const results: DeployResult['results'] = [];
  if (plan.dryRun) {
    for (const entry of plan.hosts) {
      const bits = ['dry-run'];
      if (plan.source && plan.dest) bits.push(`rsync ${plan.source} -> ${entry.host}:${plan.dest}`);
      if (plan.remote) bits.push(plan.remote);
      results.push({ host: entry.host, ok: true, latencyMs: 0, detail: bits.join('; ') });
    }
    return { plan, results };
  }

  if (!probe) {
    throw new Error('[deploy] --execute requires a host probe (bind deploy.probe or use the default SSH probe).');
  }

  const visit = async (host: string): Promise<DeployResult['results'][number]> => {
    const probed = await probe(host);
    if (!probed.ok) return { host, ...probed };
    let latencyMs = probed.latencyMs;
    let detail = probed.detail;
    if (plan.source !== undefined && plan.dest !== undefined) {
      const execCopy = copy ?? defaultRsyncCopy;
      const copied = await execCopy(host, plan.source, plan.dest);
      latencyMs += copied.latencyMs;
      detail = joinDetail(detail, copied.detail);
      if (!copied.ok) return { host, ok: false, latencyMs, detail };
    }
    if (plan.remote !== undefined) {
      const exec = run ?? defaultSshRun;
      const ran = await exec(host, plan.remote);
      latencyMs += ran.latencyMs;
      detail = joinDetail(detail, ran.detail);
      if (!ran.ok) return { host, ok: false, latencyMs, detail };
    }
    return { host, ok: true, latencyMs, detail };
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
