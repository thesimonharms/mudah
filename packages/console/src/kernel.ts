import { UsageError, type Application, type CommandModule } from '@mudah-cli/core';
import type { Output } from '@mudah-cli/ui';
import {
  Command,
  ArgumentParseError,
  parseInput,
  parseSignature,
  type ParsedInput,
  type ParsedSignature,
} from './command.js';

export type { CommandModule } from '@mudah-cli/core';

export interface CommandEntry {
  name: string;
  signature: ParsedSignature;
  description: string;
  factory: () => Command;
  /**
   * Namespace prefix, when the name is grouped (`db:migrate` → `db`).
   * Ungrouped commands have `group: undefined`.
   */
  group?: string;
  /** Short blurb for the group, from the first command that declared one. */
  groupDescription?: string;
}

/** A group of commands sharing a namespace. */
export interface CommandGroup {
  readonly name: string;
  readonly description: string;
  readonly commands: readonly CommandEntry[];
}

/** Split `db:migrate` into its group and short name. */
export function splitCommandName(name: string): { group: string | undefined; name: string } {
  const separator = name.indexOf(':');
  if (separator <= 0) return { group: undefined, name };
  return { group: name.slice(0, separator), name: name.slice(separator + 1) };
}

/** Read an optional `groupDescription` declared on a command instance. */
function groupDescriptionOf(instance: Command): string | undefined {
  const value = (instance as { groupDescription?: unknown }).groupDescription;
  return typeof value === 'string' ? value : undefined;
}

/**
 * The console kernel: command registry and dispatcher.
 *
 * Flow for `dispatch(argv)`:
 * 1. Resolve the command by name (UsageError when unknown/missing).
 * 2. Emit `command.before`, boot lazy providers for this command.
 * 3. Parse argv against the command's signature.
 * 4. Inject app/output/input and call `handle()`.
 * 5. Emit `command.after` with the exit code and duration.
 *
 * Errors propagate to the caller (the `@mudah-cli/mudah` umbrella renders them and
 * maps them to exit codes).
 */
export class ConsoleKernel {
  private readonly commands = new Map<string, CommandEntry>();

  constructor(
    private readonly app: Application,
    private readonly output: Output,
  ) {}

  /** Register a command module (default export is the command class). */
  register(module: CommandModule): this {
    const Ctor = module.default;
    // Metadata is read from an instance: `signature`/`description` are
    // instance fields (not prototype properties).
    const instance = new Ctor() as Command;
    if (typeof instance.signature !== 'string' || instance.signature.length === 0) {
      throw new Error(`[console] Command ${Ctor.name} has no signature.`);
    }
    if (typeof instance.handle !== 'function') {
      throw new Error(`[console] Command ${Ctor.name} has no handle() method.`);
    }
    const signature = parseSignature(instance.signature);
    if (this.commands.has(signature.name)) {
      throw new Error(`[console] Duplicate command name "${signature.name}".`);
    }
    const entry: CommandEntry = {
      name: signature.name,
      signature,
      description: instance.description ?? '',
      factory: () => new Ctor() as Command,
    };
    const group = splitCommandName(signature.name).group;
    if (group !== undefined) {
      entry.group = group;
      const declared = groupDescriptionOf(instance);
      if (declared !== undefined) entry.groupDescription = declared;
    }
    this.commands.set(signature.name, entry);
    return this;
  }

  /** All registered commands, sorted by name. */
  list(): CommandEntry[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  get(name: string): CommandEntry | undefined {
    return this.commands.get(name);
  }

  /**
   * Names of every registered group, sorted. Groups come from `group:name`
   * command signatures — registering `db:migrate` creates the `db` group.
   */
  groups(): CommandGroup[] {
    const byName = new Map<string, CommandEntry[]>();
    for (const entry of this.list()) {
      if (entry.group === undefined) continue;
      const bucket = byName.get(entry.group);
      if (bucket === undefined) byName.set(entry.group, [entry]);
      else bucket.push(entry);
    }
    return [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, commands]) => ({
        name,
        description: commands.find((c) => c.groupDescription !== undefined)?.groupDescription ?? '',
        commands,
      }));
  }

  /** Commands with no group. */
  ungrouped(): CommandEntry[] {
    return this.list().filter((entry) => entry.group === undefined);
  }

  /** True when a group with this name exists (implying commands under it). */
  hasGroup(name: string): boolean {
    for (const entry of this.commands.values()) {
      if (entry.group === name) return true;
    }
    return false;
  }

  /** Dispatch argv (command name + arguments). Returns the exit code. */
  async dispatch(argv: string[]): Promise<number> {
    const name = argv[0];
    if (name === undefined) {
      throw new UsageError('No command specified.', {
        hint: 'Run with --help to see available commands.',
      });
    }

    const entry = this.commands.get(name);
    if (!entry) {
      throw new UsageError(`Unknown command "${name}".`, {
        hint: 'Run with --help to see available commands.',
      });
    }

    await this.app.events().emit('command.before', { command: name, argv });
    await this.app.bootLazyForCommand(name);

    let input: ParsedInput;
    try {
      input = parseInput(entry.signature, argv.slice(1));
    } catch (error) {
      if (error instanceof ArgumentParseError) {
        throw new UsageError(error.message, { usage: entry.signature.name });
      }
      throw error;
    }

    const command = entry.factory();
    command.__inject(this.app, this.output, input);

    const startedAt = performance.now();
    let exitCode: number;
    try {
      exitCode = (await command.handle()) ?? 0;
    } catch (error) {
      await this.app.events().emit('command.error', { command: name, error });
      throw error;
    }
    const durationMs = Math.round(performance.now() - startedAt);

    await this.app.events().emit('command.after', { command: name, exitCode, durationMs });
    return exitCode;
  }
}
