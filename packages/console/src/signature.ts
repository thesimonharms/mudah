import { resolve as resolvePath } from 'node:path';

export interface ParsedArg {
  name: string;
  optional: boolean;
  defaultValue?: string;
  /** Variadic: collects all remaining positionals (`{paths...}`). */
  variadic?: boolean;
  /** Optional declared type, e.g. `{count:int}` or `{mode:enum[a,b]}`. */
  type?: CoercionType;
  /** Allowed values for an `enum` argument. */
  enumValues?: string[];
}

export interface ParsedOption {
  name: string;
  /** Takes a value (`--env=production`). */
  takesValue: boolean;
  defaultValue?: string;
  /** Optional declared type, e.g. `[port:int]` or `[mode:enum[a,b]]`. */
  type?: CoercionType;
  /** Allowed values for an `enum` option. */
  enumValues?: string[];
}

export interface ParsedSignature {
  name: string;
  args: ParsedArg[];
  options: ParsedOption[];
}

export interface ParsedInput {
  args: Record<string, string | number>;
  /** Variadic arg values, keyed by arg name (only for `{name...}`). */
  lists: Record<string, string[]>;
  options: Record<string, string | number | boolean>;
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

  // Names are unvalidated elsewhere, so a typo like "db:" would otherwise
  // register an unreachable command instead of failing at authoring time.
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?::[a-zA-Z][a-zA-Z0-9-]*)?$/.test(result.name)) {
    throw new Error(
      `[console] Invalid command name "${result.name}" in signature "${signature}". Use a name like "deploy" or a group like "db:migrate".`,
    );
  }

  let variadicIndex = -1;
  for (const match of trimmed.matchAll(/\{([^{}]+)\}/g)) {
    const inner = match[1]!;
    // Non-greedy name so trailing "..." is captured by the variadic group,
    // not eaten by the name character class.
    const parsed =
      /^([a-zA-Z][\w.-]*?)(?::(int|float|path|glob|enum(?:\[[^\]]*\])?))?(\?)?(\.\.\.)?(?:=(.*))?$/.exec(inner);
    if (!parsed) {
      throw new Error(`[console] Invalid argument syntax "{${inner}}" in signature "${signature}".`);
    }
    const rawType = parsed[2] ?? '';
    const isEnum = rawType.startsWith('enum');
    const type = isEnum ? 'enum' : rawType;
    const enumValues = isEnum ? extractEnumValues(rawType) : undefined;
    const isVariadic = parsed[4] !== undefined;
    if (isVariadic && type) {
      throw new Error(`[console] Variadic argument "{${inner}}" cannot declare a type; coerce list elements in the command.`);
    }
    if (isVariadic && parsed[5] !== undefined) {
      throw new Error(`[console] Variadic argument "{${inner}}" cannot take a default value.`);
    }
    if (isVariadic && parsed[3] === '?') {
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
      optional: parsed[3] === '?',
      ...(isVariadic ? { variadic: true } : {}),
      defaultValue: parsed[5],
      ...(type ? { type: type as CoercionType, enumValues } : {}),
    });
  }
  if (variadicIndex !== -1 && variadicIndex !== result.args.length - 1) {
    throw new Error(`[console] Variadic argument must be the final argument in signature "${signature}".`);
  }

  for (const match of trimmed.matchAll(/\[-{2}([a-zA-Z][\w-]*)(?::(int|float|path|glob|enum(?:\[[^\]]*\])?))?(?:=([^}\]]*))?\]/g)) {
    const name = match[1]!;
    const rawType = match[2] ?? '';
    const isEnum = rawType.startsWith('enum');
    const type = isEnum ? 'enum' : rawType;
    const enumValues = isEnum ? extractEnumValues(rawType) : undefined;
    const defaultValue = match[3];
    const takesValue = defaultValue !== undefined || type !== '';
    const option: ParsedOption = { name, takesValue };
    if (defaultValue !== undefined) option.defaultValue = defaultValue;
    if (type) {
      option.type = type as CoercionType;
      option.enumValues = enumValues;
    }
    result.options.push(option);
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
      const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
      const option = signature.options.find((o) => o.name === name);
      if (eq === -1) {
        input.options[name] = true;
      } else {
        const raw = token.slice(eq + 1);
        input.options[name] = option ? coerceValue(raw, option.type, option.enumValues) : raw;
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
      input.args[arg.name] = coerceValue(value, arg.type, arg.enumValues);
    } else if (arg.defaultValue !== undefined) {
      input.args[arg.name] = coerceValue(arg.defaultValue, arg.type, arg.enumValues);
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
      if (!option.takesValue) {
        input.options[option.name] = false;
      } else if (option.defaultValue !== undefined) {
        input.options[option.name] = coerceValue(option.defaultValue, option.type, option.enumValues);
      } else {
        input.options[option.name] = '';
      }
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

export type CoercionType = 'int' | 'float' | 'path' | 'glob' | 'enum';

/**
 * Turn a raw argv string into its typed value for a declared `:type`.
 * Throws `ArgumentParseError` on invalid input so failures surface at parse
 * time with a uniform error.
 */
export function coerceValue(value: string, type: CoercionType | undefined, enumValues?: string[]): string | number {
  switch (type) {
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) {
        throw new ArgumentParseError(`"${value}" is not an integer.`);
      }
      return n;
    }
    case 'float': {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new ArgumentParseError(`"${value}" is not a number.`);
      }
      return n;
    }
    case 'enum': {
      if (enumValues !== undefined && !enumValues.includes(value)) {
        throw new ArgumentParseError(`"${value}" is not one of: ${enumValues.join(', ')}.`);
      }
      return value;
    }
    case 'path':
      return resolvePath(value);
    case 'glob':
      return value;
    default:
      return value;
  }
}

/** Pull allowed values out of an `enum[a,b,c]` type token. */
function extractEnumValues(type: string): string[] | undefined {
  const match = /^enum\[(.*)\]$/.exec(type);
  return match ? match[1]!.split(',').map((v) => v.trim()) : undefined;
}
