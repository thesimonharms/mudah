import { readFile } from 'node:fs/promises';
import { Command } from '@mudah-cli/console';
import { Column, Label, parseSessionTape, replayTapeAsync, type ReplayHandle, type SessionTape } from '@mudah-cli/tui';
import { TestTui } from '@mudah-cli/testing';

/**
 * Built-in `replay` command: print or apply a structured session tape.
 */
export default class ReplayCommand extends Command {
  signature = 'replay {file?} [--play] [--speed=]';
  description = 'Replay a structured TUI session JSON file';

  async handle(): Promise<number> {
    const file = this.arg('file');
    if (file === undefined) {
      this.output.info('Usage: replay {file} [--play]');
      this.output.muted('JSON { version, events: [{ type, t?, key?, text? }] } or a bare event array');
      return 0;
    }

    let tape: SessionTape;
    try {
      tape = parseSessionTape(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw this.usageError(`Cannot read session file "${file}".`, message);
    }

    this.output.section(`Replay ${file}`);
    this.output.keyValue('events', String(tape.events.length));
    this.output.keyValue('recorded', tape.recordedAt);
    for (const [i, event] of tape.events.entries()) {
      const extra = event.key ?? event.text ?? `${event.x ?? 0},${event.y ?? 0}`;
      this.output.raw(`  ${i + 1}. +${event.t ?? 0}ms  ${event.type} ${extra}\n`);
    }

    if (this.option('play') === true) {
      const target: ReplayHandle = this.app.has('replay.target')
        ? this.app.make<ReplayHandle>('replay.target')
        : TestTui.mount(new Column().add(new Label('replay')), {
            cols: tape.cols ?? 80,
            rows: tape.rows ?? 24,
          });
      await replayTapeAsync(target, tape, { speed: Number(this.option('speed') ?? 1) || 1 });
      if ('snapshot' in target && typeof (target as TestTui).snapshot === 'function') {
        this.output.raw(`${(target as TestTui).snapshot()}\n`);
      }
    }

    this.output.success('replay complete');
    return 0;
  }
}
