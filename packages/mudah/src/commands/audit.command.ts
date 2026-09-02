import { spawnSync } from 'node:child_process';
import { Command } from '@mudah-cli/console';
import { CORE_VERSION, gatePlugin, t, type PluginInfo } from '@mudah-cli/core';

export interface AuditAdvisory {
  readonly name: string;
  readonly severity: string;
  readonly title: string;
}

export type AuditSpawn = (
  command: string,
  args: readonly string[],
  options: { cwd: string; encoding: 'utf8' },
) => { status: number | null; stdout: string; stderr: string; error?: Error };

/**
 * Parse `npm audit --json` into a flat advisory list. npm 8/9/10 shapes all
 * nest under `vulnerabilities` or `advisories`.
 */
export function parseNpmAudit(jsonText: string): AuditAdvisory[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const rec = parsed as Record<string, unknown>;
  const out: AuditAdvisory[] = [];

  const advisories = rec['advisories'];
  if (advisories && typeof advisories === 'object') {
    for (const value of Object.values(advisories as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const row = value as Record<string, unknown>;
      out.push({
        name: String(row['module_name'] ?? row['name'] ?? 'unknown'),
        severity: String(row['severity'] ?? 'info'),
        title: String(row['title'] ?? row['overview'] ?? 'advisory'),
      });
    }
  }

  const vulns = rec['vulnerabilities'];
  if (vulns && typeof vulns === 'object') {
    for (const [name, value] of Object.entries(vulns as Record<string, unknown>)) {
      if (typeof value !== 'object' || value === null) continue;
      const row = value as Record<string, unknown>;
      const via = row['via'];
      const title =
        Array.isArray(via) && typeof via[0] === 'object' && via[0] !== null
          ? String((via[0] as { title?: string }).title ?? name)
          : String(row['via'] ?? name);
      out.push({
        name,
        severity: String(row['severity'] ?? 'info'),
        title,
      });
    }
  }

  return out;
}

export function runNpmAudit(
  cwd: string,
  spawn: AuditSpawn = (command, args, options) => spawnSync(command, [...args], options),
): AuditAdvisory[] {
  const result = spawn('npm', ['audit', '--json', '--omit=dev'], { cwd, encoding: 'utf8' });
  if (result.error) return [];
  const text = (result.stdout || result.stderr || '').trim();
  if (text.length === 0) return [];
  return parseNpmAudit(text);
}

/**
 * Built-in `audit` — npm advisories plus deprecated plugins and peer-range mismatches.
 */
export default class AuditCommand extends Command {
  signature = 'audit';
  description = 'Check plugins for known vulnerabilities, deprecation, and peer mismatches';
  static exitCodes = { 1: 'Advisories or plugin warnings were reported' };

  async handle() {
    const plugins = typeof this.app.plugins === 'function' ? this.app.plugins() : [];
    let warnings = 0;

    const advisories = runNpmAudit(this.app.basePath);
    if (advisories.length > 0) {
      this.output.section('Advisories');
      for (const row of advisories) {
        this.output.warn(`${row.severity}  ${row.name}  ${row.title}`);
        warnings += 1;
      }
    }

    for (const warning of this.app.pluginWarnings()) {
      this.output.warn(warning);
      warnings += 1;
    }

    for (const plugin of plugins as PluginInfo[]) {
      if (plugin.deprecated) {
        const reason = typeof plugin.deprecated === 'string' && plugin.deprecated.length > 0 ? `: ${plugin.deprecated}` : '';
        this.output.warn(`${plugin.name} is deprecated${reason}`);
        warnings += 1;
      }
      const gate = gatePlugin(plugin, { coreVersion: CORE_VERSION });
      if (!gate.ok && gate.reason) {
        this.output.warn(gate.reason);
        warnings += 1;
      }
    }

    if (warnings === 0) this.output.success(t('audit.clean'));
    return warnings > 0 ? 1 : 0;
  }
}
