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

/** Render the full command list. */
export function renderCommandList(appName: string, version: string, entries: CommandEntry[], lines: string[]): void {
  lines.push(`${appName} v${version}`, '');
  if (entries.length === 0) {
    lines.push('No commands registered.');
    return;
  }
  lines.push('Commands:');
  const width = Math.max(...entries.map((e) => visibleLength(e.name))) + 2;
  for (const entry of entries) {
    lines.push(formatCommandRow(entry, width));
  }
  lines.push('', `Use "${appName} <command> --help" for command details.`);
}

/** Render single-command help. */
export function renderCommandHelp(appName: string, entry: CommandEntry, lines: string[]): void {
  lines.push(`Usage: ${appName} ${formatUsage(entry)}`, '');
  if (entry.description) {
    lines.push('Description');
    lines.push(`  ${entry.description}`, '');
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
