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
    this.commands.set(signature.name, {
      name: signature.name,
      signature,
      description: instance.description ?? '',
      factory: () => new Ctor() as Command,
    });
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
