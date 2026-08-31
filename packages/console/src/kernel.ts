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
  /** Alternate names that resolve to this command. */
  aliases?: string[];
  /** When set, the command is deprecated; a string is the deprecation reason. */
  deprecated?: boolean | string;
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

/** Filter and dedupe aliases, excluding the canonical name. */
function normalizeAliases(aliases: string[] | undefined, canonical: string): string[] {
  if (!aliases) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of aliases) {
    if (!alias || alias === canonical) continue;
    if (seen.has(alias)) continue;
    seen.add(alias);
    out.push(alias);
  }
  return out;
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
 * Aliases resolve to the canonical command; lifecycle events and lazy-provider
 * booting always reference the canonical name.
 *
 * Errors propagate to the caller (the `@mudah-cli/mudah` umbrella renders them and
 * maps them to exit codes).
 */
export class ConsoleKernel {
  private readonly commands = new Map<string, CommandEntry>();
  /** Alias name -> canonical command name. Kept separate from `commands` so the
   * command list never shows alias duplicates. */
  private readonly aliases = new Map<string, string>();

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
    const aliasList = normalizeAliases(instance.aliases, signature.name);
    for (const alias of aliasList) {
      // First-wins: an alias that already names a command is left untouched.
      if (this.commands.has(alias) || this.aliases.has(alias)) continue;
      this.aliases.set(alias, signature.name);
    }
    entry.aliases = aliasList;
    entry.deprecated = instance.deprecated;
    this.commands.set(signature.name, entry);
    return this;
  }

  /** All registered commands, sorted by name. */
  list(): CommandEntry[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  has(name: string): boolean {
    return this.commands.has(name) || this.aliases.has(name);
  }

  get(name: string): CommandEntry | undefined {
    const canonical = this.aliases.get(name);
    return this.commands.get(canonical ?? name);
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

    const entry = this.get(name);
    if (!entry) {
      throw new UsageError(`Unknown command "${name}".`, {
        hint: 'Run with --help to see available commands.',
      });
    }

    if (entry.deprecated) {
      const reason = typeof entry.deprecated === 'string' && entry.deprecated.length > 0
        ? entry.deprecated
        : '';
      this.output.warn(`${entry.name} is deprecated${reason ? `: ${reason}` : ''}.`);
    }

    const canonical = entry.name;
    await this.app.events().emit('command.before', { command: canonical, argv });
    await this.app.bootLazyForCommand(canonical);

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
      await this.app.events().emit('command.error', { command: canonical, error });
      throw error;
    }
    const durationMs = Math.round(performance.now() - startedAt);

    await this.app.events().emit('command.after', { command: canonical, exitCode, durationMs });
    return exitCode;
  }
}
