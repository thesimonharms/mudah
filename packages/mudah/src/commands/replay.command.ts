import { readFile } from 'node:fs/promises';
import { Command } from '@mudah-cli/console';
import type { SessionAction } from '@mudah-cli/tui';

function isAction(value: unknown): value is SessionAction {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === 'key' || type === 'text' || type === 'click' || type === 'paste';
}

/**
 * Built-in `replay` command: print a structured session JSON
 * (`{ type, key?, text? }[]`). No PTY.
 */
export default class ReplayCommand extends Command {
  signature = 'replay {file?}';
  description = 'Replay a structured TUI session JSON file';

  async handle(): Promise<number> {
    const file = this.arg('file');
    if (file === undefined) {
      this.output.info('Usage: replay {file}');
      this.output.muted('JSON array of { type: key|text|click|paste, key?, text?, x?, y? }');
      return 0;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw this.usageError(`Cannot read session file "${file}".`, message);
    }

    const events = Array.isArray(raw) ? raw.filter(isAction) : [];
    this.output.section(`Replay ${file}`);
    this.output.keyValue('events', String(events.length));
    for (const [i, event] of events.entries()) {
      const extra = event.key ?? event.text ?? `${event.x ?? 0},${event.y ?? 0}`;
      this.output.raw(`  ${i + 1}. ${event.type} ${extra}\n`);
    }
    this.output.success('replay complete');
    return 0;
  }
}
