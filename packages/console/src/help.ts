import { visibleLength } from '@mudah-cli/ui';
import type { CommandEntry } from './kernel.js';

/** The full invocation string for a command: `name {args} [options]`. */
export function formatUsage(entry: CommandEntry): string {
  const parts = [entry.signature.name];
  for (const arg of entry.signature.args) {
    if (arg.variadic) {
      parts.push(`{${arg.name}...}`);
      continue;
    }
    if (arg.optional) {
      parts.push(arg.defaultValue !== undefined ? `{${arg.name}=${arg.defaultValue}}` : `{${arg.name}?}`);
    } else {
      parts.push(arg.defaultValue !== undefined ? `{${arg.name}=${arg.defaultValue}}` : `{${arg.name}}`);
    }
  }
  if (entry.signature.options.length > 0) {
    parts.push(
      entry.signature.options
        .map((o) => (o.takesValue ? `--${o.name}=` : `--${o.name}`))
        .join(' '),
    );
  }
  return parts.join(' ');
}

/** One-line command row for the command list. */
export function formatCommandRow(entry: CommandEntry, width: number): string {
  const padded = entry.name + ' '.repeat(Math.max(1, width - visibleLength(entry.name)));
  return `  ${padded} ${entry.description}`;
}

/** Render the full command list, with grouped commands under headers. */
export function renderCommandList(appName: string, version: string, entries: CommandEntry[], lines: string[]): void {
  lines.push(`${appName} v${version}`, '');
  if (entries.length === 0) {
    lines.push('No commands registered.');
    return;
  }

  const grouped = groupEntries(entries);
  const ungrouped = entries.filter((entry) => entry.group === undefined);
  const width = Math.max(...entries.map((e) => visibleLength(e.name))) + 2;

  if (ungrouped.length > 0) {
    lines.push('Commands:');
    for (const entry of ungrouped) {
      lines.push(formatCommandRow(entry, width));
    }
    lines.push('');
  }

  for (const [name, commands] of grouped) {
    lines.push(`${name}:`);
    for (const entry of commands) {
      lines.push(formatCommandRow(entry, width));
    }
    lines.push('');
  }

  // A trailing blank line always precedes the footer.
  if (ungrouped.length === 0 && grouped.length > 0) lines.pop();
  lines.push(`Use "${appName} <command> --help" for command details.`);
}

/** Bucket grouped entries by namespace, in first-seen order. */
function groupEntries(entries: CommandEntry[]): Array<[string, CommandEntry[]]> {
  const buckets = new Map<string, CommandEntry[]>();
  for (const entry of entries) {
    if (entry.group === undefined) continue;
    const bucket = buckets.get(entry.group);
    if (bucket === undefined) buckets.set(entry.group, [entry]);
    else bucket.push(entry);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Render single-command help. */
export function renderCommandHelp(appName: string, entry: CommandEntry, lines: string[]): void {
  lines.push(`Usage: ${appName} ${formatUsage(entry)}`, '');
  if (entry.description) {
    lines.push('Description');
    lines.push(`  ${entry.description}`, '');
  }
  if (entry.deprecated) {
    const reason =
      typeof entry.deprecated === 'string' && entry.deprecated.length > 0
        ? entry.deprecated
        : 'This command is deprecated.';
    lines.push('Deprecated:');
    lines.push(`  ${reason}`, '');
  }
  if (entry.aliases && entry.aliases.length > 0) {
    lines.push('Aliases:');
    lines.push(`  ${entry.aliases.join(', ')}`, '');
  }
  if (entry.exitCodes && Object.keys(entry.exitCodes).length > 0) {
    lines.push('Exit codes:');
    for (const [code, desc] of Object.entries(entry.exitCodes)) {
      lines.push(`  ${code}  ${desc}`);
    }
    lines.push('');
  }
  if (entry.signature.args.length > 0) {
    lines.push('Arguments:');
    const width = Math.max(...entry.signature.args.map((a) => a.name.length)) + 2;
    for (const arg of entry.signature.args) {
      const kind = arg.variadic
        ? 'one or more (variadic)'
        : arg.optional
          ? arg.defaultValue !== undefined
            ? `optional (default: ${arg.defaultValue})`
            : 'optional'
          : 'required';
      lines.push(`  ${arg.name + ' '.repeat(Math.max(1, width - arg.name.length))} ${kind}`);
    }
    lines.push('');
  }
  if (entry.signature.options.length > 0) {
    lines.push('Options:');
    for (const option of entry.signature.options) {
      const flag = option.takesValue ? `--${option.name}=` : `--${option.name}`;
      const note =
        option.takesValue
          ? option.defaultValue !== undefined
            ? `(default: ${option.defaultValue})`
            : ''
          : '';
      lines.push(`  ${flag}  ${note}`.trimEnd());
    }
    lines.push('  --help  Show this help');
  }
}
