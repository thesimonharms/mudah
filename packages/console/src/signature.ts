export interface ParsedArg {
  name: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ParsedOption {
  name: string;
  /** Takes a value (`--env=production`). */
  takesValue: boolean;
  defaultValue?: string;
}

export interface ParsedSignature {
  name: string;
  args: ParsedArg[];
  options: ParsedOption[];
}

export interface ParsedInput {
  args: Record<string, string>;
  options: Record<string, string | boolean>;
}

/**
 * Parse a command signature string:
 *
 * ```
 * deploy {branch?} {ref=main} [--force] [--env=production]
 * ```
 */
export function parseSignature(signature: string): ParsedSignature {
  const result: ParsedSignature = { name: '', args: [], options: [] };

  const trimmed = signature.trim();
  const firstSpace = trimmed.search(/\s/);
  result.name = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);

  for (const match of trimmed.matchAll(/\{([^{}]+)\}/g)) {
    const inner = match[1]!;
    const parsed = /^([a-zA-Z][\w:.-]*)(\?)?(?:=(.*))?$/.exec(inner);
    if (!parsed) {
      throw new Error(`[console] Invalid argument syntax "{${inner}}" in signature "${signature}".`);
    }
    result.args.push({
      name: parsed[1]!,
      optional: parsed[2] === '?',
      defaultValue: parsed[3],
    });
  }

  for (const match of trimmed.matchAll(/\[-{2}([a-zA-Z][\w-]*)(?:=([^}\]]*))?\]/g)) {
    const name = match[1]!;
    const takesValue = match[2] !== undefined;
    result.options.push({
      name,
      takesValue,
      defaultValue: takesValue ? match[2] : undefined,
    });
  }

  return result;
}

/**
 * Parse raw argv (everything after the command name) against a parsed
 * signature. Positional values fill args in order; `--name` / `--name=value`
 * fill options. Throws `ArgumentParseError` on violations.
 */
export function parseInput(signature: ParsedSignature, argv: string[]): ParsedInput {
  const input: ParsedInput = { args: {}, options: {} };

  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith('--')) {
      const eq = token.indexOf('=');
      if (eq === -1) {
        input.options[token.slice(2)] = true;
      } else {
        input.options[token.slice(2, eq)] = token.slice(eq + 1);
      }
      continue;
    }
    positionals.push(token);
  }

  // Validate unknown options.
  const knownOptions = new Set(signature.options.map((o) => o.name));
  for (const name of Object.keys(input.options)) {
    if (!knownOptions.has(name)) {
      throw new ArgumentParseError(`Unknown option "--${name}" for command "${signature.name}".`);
    }
  }

  // Fill args.
  if (positionals.length > signature.args.length) {
    throw new ArgumentParseError(
      `Too many arguments for "${signature.name}": expected at most ${signature.args.length}.`,
    );
  }
  signature.args.forEach((arg, index) => {
    const value = positionals[index];
    if (value !== undefined) {
      input.args[arg.name] = value;
    } else if (arg.defaultValue !== undefined) {
      input.args[arg.name] = arg.defaultValue;
    } else if (!arg.optional) {
      throw new ArgumentParseError(`Missing required argument "${arg.name}" for command "${signature.name}".`);
    }
  });

  // Fill options with defaults.
  for (const option of signature.options) {
    if (input.options[option.name] === undefined) {
      input.options[option.name] = option.takesValue ? (option.defaultValue ?? '') : false;
    }
  }

  return input;
}

export class ArgumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgumentParseError';
  }
}
