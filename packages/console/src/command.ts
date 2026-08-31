import { UsageError, type Application } from '@mudah-cli/core';
import type { Output } from '@mudah-cli/ui';
import { Prompts } from './prompts.js';
import { parseInput, parseSignature, type ParsedInput, type ParsedSignature } from './signature.js';

/**
 * Base class for all Mudah commands.
 *
 * ```ts
 * class Greet extends Command {
 *   signature = 'greet {name?} [--shout]';
 *   description = 'Say hello.';
 *
 *   async handle() {
 *     this.output.success(`Hello, ${this.arg('name') ?? 'world'}!`);
 *   }
 * }
 * ```
 *
 * The kernel injects `app`, `output`, and `input` before calling
 * `handle()`, which returns the process exit code (void = 0).
 */
export abstract class Command {
  /** Signature string: `name {arg?} [--flag=]`. */
  signature = '';

  /** One-line description for help output. */
  description = '';

  /**
   * Blurb for the group this command belongs to. Only meaningful on grouped
   * signatures (`db:migrate`); the first command to set it labels the group
   * in the command list.
   */
  groupDescription = '';

  /** Additional names that also resolve to this command. */
  aliases?: string[];
  /** When set, the command is deprecated; a string is the deprecation reason. */
  deprecated?: boolean | string;

  /** The application (container, config, events). */
  app!: Application;
  /** Styled output for the user. */
  output!: Output;
  /** Parsed positional args and options. */
  input!: ParsedInput;

  private prompts: Prompts | null = null;

  protected parsedSignature(): ParsedSignature {
    return parseSignature(this.signature);
  }

  /** The kernel sets this before `handle()`. */
  __inject(app: Application, output: Output, input: ParsedInput): void {
    this.app = app;
    this.output = output;
    this.input = input;
  }

  /** Abstract entry point. Return an exit code, or void for 0. */
  abstract handle(): Promise<number | void> | number | void;

  /** A positional argument value (or its signature default). */
  arg<T extends string | number = string>(name: string): T | undefined {
    return this.input.args[name] as T | undefined;
  }

  /**
   * Values collected by a variadic argument (`{paths...}`) — empty when the
   * argument doesn't exist or collected nothing.
   */
  list(name: string): string[] {
    return this.input.lists[name] ?? [];
  }

  /** An option value: boolean for flags, string for `--opt=value`. */
  option<T extends string | number | boolean = string | boolean>(name: string): T | undefined {
    return this.input.options[name] as T | undefined;
  }

  protected promptsInstance(): Prompts {
    if (!this.prompts) this.prompts = new Prompts();
    return this.prompts;
  }

  protected ask(question: string, defaultValue?: string): Promise<string> {
    return this.promptsInstance().ask(question, { defaultValue });
  }

  protected confirm(question: string, defaultValue?: boolean): Promise<boolean> {
    return this.promptsInstance().confirm(question, { defaultValue });
  }

  protected select(question: string, choices: string[]): Promise<string> {
    return this.promptsInstance().select(question, choices);
  }

  /** Pick any number of choices (arrow keys + space on a TTY, numbered menu otherwise). */
  protected multiselect(question: string, choices: string[], defaultChecked?: number[]): Promise<string[]> {
    return this.promptsInstance().multiselect(question, choices, { defaultChecked });
  }

  /** Masked text entry — the value is never echoed to the terminal. */
  protected password(question: string): Promise<string> {
    return this.promptsInstance().password(question);
  }

  /**
   * Render a usage error with this command's usage line. Commands call this
   * when their own validation fails.
   */
  protected usageError(message: string, hint?: string): UsageError {
    return new UsageError(message, {
      hint,
      usage: this.signature,
    });
  }
}

export { coerceValue, parseInput, parseSignature, ArgumentParseError, type CoercionType, type ParsedInput, type ParsedSignature } from './signature.js';
export { suggestCommand, fuzzyRank, editDistance } from './fuzzy-match.js';
