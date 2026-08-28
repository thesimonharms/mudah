export interface ParsedArg {
  name: string;
  optional: boolean;
  defaultValue?: string;
  /** Variadic: collects all remaining positionals (`{paths...}`). */
  variadic?: boolean;
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
  /** Variadic arg values, keyed by arg name (only for `{name...}`). */
  lists: Record<string, string[]>;
  options: Record<string, string | boolean>;
}

/**
 * Parse a command signature string:
 *
 * ```
 * deploy {branch?} {ref=main} [--force] [--env=production]
 * convert {paths...} [--to=webp]
 * ```
 */
export function parseSignature(signature: string): ParsedSignature {
  const result: ParsedSignature = { name: '', args: [], options: [] };

  const trimmed = signature.trim();
  const firstSpace = trimmed.search(/\s/);
  result.name = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);

  let variadicIndex = -1;
  for (const match of trimmed.matchAll(/\{([^{}]+)\}/g)) {
    const inner = match[1]!;
    // Non-greedy name so trailing "..." is captured by the variadic group,
    // not eaten by the name character class.
    const parsed = /^([a-zA-Z][\w:.-]*?)(\?)?(\.\.\.)?(?:=(.*))?$/.exec(inner);
    if (!parsed) {
      throw new Error(`[console] Invalid argument syntax "{${inner}}" in signature "${signature}".`);
    }
    const isVariadic = parsed[3] !== undefined;
    if (isVariadic && parsed[4] !== undefined) {
      throw new Error(`[console] Variadic argument "{${inner}}" cannot take a default value.`);
    }
    if (isVariadic && parsed[2] === '?') {
      throw new Error(`[console] Variadic argument "{${inner}}" cannot also be optional.`);
    }
    if (isVariadic) {
      if (variadicIndex !== -1) {
        throw new Error(`[console] Only one variadic argument is allowed in signature "${signature}".`);
      }
      variadicIndex = result.args.length;
    }
    result.args.push({
      name: parsed[1]!,
      optional: parsed[2] === '?',
      ...(isVariadic ? { variadic: true } : {}),
      defaultValue: parsed[4],
    });
  }
  if (variadicIndex !== -1 && variadicIndex !== result.args.length - 1) {
    throw new Error(`[console] Variadic argument must be the final argument in signature "${signature}".`);
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
 * fill options. A trailing variadic arg collects all remaining positionals.
 * Throws `ArgumentParseError` on violations.
 */
export function parseInput(signature: ParsedSignature, argv: string[]): ParsedInput {
  const input: ParsedInput = { args: {}, lists: {}, options: {} };

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

  const variadic = signature.args.length > 0 && (signature.args.at(-1)?.variadic === true);
  const fixedArgs = variadic ? signature.args.slice(0, -1) : signature.args;

  if (!variadic && positionals.length > signature.args.length) {
    throw new ArgumentParseError(
      `Too many arguments for "${signature.name}": expected at most ${signature.args.length}.`,
    );
  }

  // Fixed args consume positionals in order.
  fixedArgs.forEach((arg, index) => {
    const value = positionals[index];
    if (value !== undefined) {
      input.args[arg.name] = value;
    } else if (arg.defaultValue !== undefined) {
      input.args[arg.name] = arg.defaultValue;
    } else if (!arg.optional) {
      throw new ArgumentParseError(`Missing required argument "${arg.name}" for command "${signature.name}".`);
    }
  });

  // The variadic arg collects everything left.
  if (variadic) {
    const collected = positionals.slice(fixedArgs.length);
    const variadicName = signature.args.at(-1)!.name;
    if (collected.length === 0) {
      throw new ArgumentParseError(
        `Missing required argument "${variadicName}..." for command "${signature.name}".`,
      );
    }
    input.lists[variadicName] = collected;
  }

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
