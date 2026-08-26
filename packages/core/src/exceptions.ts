/**
 * A usage error: bad arguments, missing flags, unknown command.
 * Rendered with usage + hint, exits with code 2.
 */
export class UsageError extends Error {
  readonly hint?: string;
  readonly usage?: string;

  constructor(message: string, options: { hint?: string; usage?: string } = {}) {
    super(message);
    this.name = 'UsageError';
    this.hint = options.hint;
    this.usage = options.usage;
  }
}

/** Explicit exit with a chosen code (optionally with a message). */
export class ExitError extends Error {
  constructor(
    readonly code: number,
    message?: string,
  ) {
    super(message);
    this.name = 'ExitError';
  }
}

/** The user interrupted a prompt (escape, ctrl+c). Exits with 130. */
export class CommandCancelled extends Error {
  constructor() {
    super('Command cancelled');
    this.name = 'CommandCancelled';
  }
}
