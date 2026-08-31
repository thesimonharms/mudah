import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from '@mudah-cli/console';
import { isPlainObject, redactSecrets } from '@mudah-cli/config';

interface DiffEntry {
  added: Record<string, string>;
  removed: Record<string, string>;
  changed: Record<string, { from: string; to: string }>;
}

const MASK = '[redacted]';

/** Flatten an object into dot-path -> stringified leaf values. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (isPlainObject(value)) {
    for (const [key, val] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (isPlainObject(val)) Object.assign(out, flatten(val, path));
      else out[path] = Array.isArray(val) ? JSON.stringify(val) : String(val);
    }
  }
  return out;
}

/** Compare two flattened configs into added/removed/changed buckets. */
function diffFlat(base: Record<string, string>, current: Record<string, string>): DiffEntry {
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: DiffEntry['changed'] = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(current)])) {
    const inBase = key in base;
    const inCurrent = key in current;
    if (inCurrent && !inBase) added[key] = current[key]!;
    else if (!inCurrent && inBase) removed[key] = base[key]!;
    else if (base[key] !== current[key]) changed[key] = { from: base[key]!, to: current[key]! };
  }
  return { added, removed, changed };
}

function renderDiff(diff: DiffEntry): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(diff.removed).sort()) lines.push(`- ${key} = ${diff.removed[key]}`);
  for (const key of Object.keys(diff.added).sort()) lines.push(`+ ${key} = ${diff.added[key]}`);
  for (const key of Object.keys(diff.changed).sort()) {
    lines.push(`~ ${key}: ${diff.changed[key]!.from} -> ${diff.changed[key]!.to}`);
  }
  return lines;
}

/** Built-in `config:diff {baseline?}` command. */
export default class ConfigDiffCommand extends Command {
  signature = 'config:diff {baseline?}';
  description = 'Diff current config against a baseline JSON file (secrets are redacted)';

  async handle() {
    const cfg = this.app.config();
    const current = redactSecrets(cfg.all(), { mask: MASK });
    const baselinePath = this.arg('baseline');

    let baseline: Record<string, unknown>;
    if (baselinePath !== undefined) {
      const resolved = resolve(this.app.basePath, baselinePath);
      let raw: string;
      try {
        raw = readFileSync(resolved, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.error(`Could not read baseline "${baselinePath}": ${message}`);
        return 1;
      }
      try {
        baseline = JSON.parse(raw) as Record<string, unknown>;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.output.error(`Baseline "${baselinePath}" is not valid JSON: ${message}`);
        return 1;
      }
    } else {
      baseline = {};
    }

    const diff = diffFlat(flatten(redactSecrets(baseline, { mask: MASK })), flatten(current));

    if (this.output.isMachineReadable) {
      this.output.emit('data', 'config', diff);
      return;
    }

    if (
      Object.keys(diff.added).length === 0 &&
      Object.keys(diff.removed).length === 0 &&
      Object.keys(diff.changed).length === 0
    ) {
      this.output.success('Config matches the baseline.');
      return;
    }

    this.output.raw(renderDiff(diff).join('\n') + '\n');
    return 0;
  }
}
