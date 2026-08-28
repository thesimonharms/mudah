import {
  Application,
  UsageError,
  loadManifest,
  type Application as App,
  type MudahManifest,
} from '@mudah-cli/core';
import { detectCapabilities } from '@mudah-cli/terminal';
import { Output, resolveTheme } from '@mudah-cli/ui';
import { ConsoleKernel, renderError, renderCommandHelp, renderCommandList, parseSignature, type CommandModule } from '@mudah-cli/console';
import HelpCommand from './commands/help.command.js';
import VersionCommand from './commands/version.command.js';
import MakeCommand from './commands/make.command.js';
import BuildCommand from './commands/build.command.js';
import DoctorCommand from './commands/doctor.command.js';
import DevCommand from './commands/dev.command.js';

export interface RunOptions {
  /** Raw arguments (default: `process.argv.slice(2)`). */
  argv?: string[];
  /** Application root (default: `process.cwd()`). */
  cwd?: string;
  /** Pre-built application, mainly for tests. */
  app?: App;
  /** Environment map for capability detection (default: `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Where stdout/stderr go (defaults to the real streams). */
  stdout?: { write(data: string): unknown };
  stderr?: { write(data: string): unknown };
  /**
   * Bake the manifest instead of reading `mudah.json` from `cwd`. Use this
   * for bundled/single-file tools that run from arbitrary directories.
   */
  manifest?: MudahManifest;
  /**
   * Register command modules explicitly (bundled apps that can't rely on
   * filesystem discovery). Registered after discovered commands; duplicates
   * are skipped with a warning.
   */
  commands?: CommandModule[];
}

/**
 * The Mudah entry point. An app's `bin/<name>` stub is:
 *
 * ```js
 * #!/usr/bin/env node
 * import { run } from '@mudah-cli/mudah';
 * process.exitCode = await run();
 * ```
 *
 * `run()` boots the application (providers, discovery), builds the console
 * kernel (built-ins + discovered commands), and dispatches argv. Returns
 * the process exit code — it never throws for user-facing errors.
 */
export async function run(options: RunOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env;
  const caps = detectCapabilities({ env });

  let manifest: MudahManifest;
  try {
    manifest = options.manifest ?? loadManifest(cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    (options.stderr ?? process.stderr).write(message + '\n');
    return 1;
  }

  const app = options.app ?? new Application(cwd, manifest);

  const theme = resolveTheme(manifest.ui?.theme);
  const output = new Output({
    stream: options.stdout ?? process.stdout,
    errorStream: options.stderr ?? process.stderr,
    theme,
    colorLevel: caps.colorLevel,
    unicode: caps.unicode,
    osc9: caps.osc9,
  });

  // Output-mode flags (--json / --plain) may appear anywhere.
  if (argv.includes('--json')) {
    output.setMode('json');
  } else if (argv.includes('--plain')) {
    output.setMode('plain');
  }
  const jsonMode = output.isMachineReadable;
  const startedAt = Date.now();

  // Providers: discover app providers, boot, then evaluate lazy predicates.
  await app.discoverProviders();
  await app.boot();
  await app.evaluateLazy();

  // Kernel: built-ins first, then — in order — discovered app commands,
  // manifest extras, and explicitly injected modules (bundled apps).
  // First registration of a name wins; later duplicates are skipped so a
  // checkout that both discovers and injects the same command stays clean.
  const kernel = new ConsoleKernel(app, output);
  registerBuiltIns(kernel);
  const seen = new Set(kernel.list().map((entry) => entry.name));

  const candidates = [
    ...(await app.discoverCommandModules()),
    ...(options.commands ?? []),
  ];
  for (const extra of manifest.commands ?? []) {
    const mod = (await app.importModule(extra)) as unknown as CommandModule;
    if (mod.default) candidates.push(mod);
  }

  for (const mod of candidates) {
    try {
      const name = parseSignature(new mod.default().signature ?? '').name;
      if (name === '') continue;
      if (seen.has(name)) continue;
      seen.add(name);
    } catch {
      // register() below surfaces the real error.
    }
    try {
      kernel.register(mod);
    } catch (error) {
      (options.stderr ?? process.stderr).write((error instanceof Error ? error.message : String(error)) + '\n');
    }
  }

  // Strip the mode flags before dispatch so commands don't see them as
  // unknown options; remember the command name for envelopes/errors.
  const dispatchArgv = argv.filter((a) => a !== '--json' && a !== '--plain');
  const commandName = dispatchArgv[0];

  // Global flags.
  const [first] = dispatchArgv;
  if (first === undefined || first === '--help' || first === '-h') {
    if (jsonMode) {
      options.stdout?.write(
        output.jsonEnvelope({ ok: true, exitCode: 0, command: 'help', commands: kernel.list().map((c) => c.name) }),
      );
      return 0;
    }
    const lines: string[] = [];
    renderCommandList(manifest.name, manifest.version, kernel.list(), lines);
    output.raw(lines.join('\n'));
    return 0;
  }
  if (first === '--version') {
    if (jsonMode) {
      options.stdout?.write(output.jsonEnvelope({ ok: true, exitCode: 0, command: 'version', version: manifest.version }));
      return 0;
    }
    output.info(`${manifest.name} v${manifest.version}`);
    return 0;
  }
  if ((argv[1] === '--help' || argv[1] === '-h') && kernel.has(first)) {
    if (jsonMode) {
      const entry = kernel.get(first)!;
      options.stdout?.write(
        output.jsonEnvelope({
          ok: true,
          exitCode: 0,
          command: first,
          help: { usage: entry.signature.name, description: entry.description },
        }),
      );
      return 0;
    }
    const lines: string[] = [];
    renderCommandHelp(manifest.name, kernel.get(first)!, lines);
    output.raw(lines.join('\n'));
    return 0;
  }

  try {
    const code = await kernel.dispatch(dispatchArgv);
    if (jsonMode) {
      options.stdout?.write(
        output.jsonEnvelope({
          ok: code === 0,
          exitCode: code,
          command: commandName,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
    return code;
  } catch (rawError) {
    let parsed: { message: string; hint?: string; usage?: string };
    if (rawError instanceof UsageError) {
      parsed = { message: rawError.message, hint: rawError.hint, usage: rawError.usage };
    } else if (rawError instanceof Error) {
      parsed = { message: rawError.message };
    } else {
      parsed = { message: String(rawError) };
    }
    const code = renderError(rawError, output);
    if (jsonMode) {
      options.stdout?.write(
        output.jsonEnvelope({
          ok: false,
          exitCode: code,
          command: commandName,
          durationMs: Date.now() - startedAt,
          error: parsed,
        }),
      );
    }
    return code;
  }
}

function registerBuiltIns(kernel: ConsoleKernel): void {
  kernel.register({
    default: class extends HelpCommand {
      constructor() {
        super(kernel);
      }
    },
  });
  kernel.register({ default: VersionCommand });
  kernel.register({ default: MakeCommand });
  kernel.register({ default: BuildCommand });
  kernel.register({ default: DoctorCommand });
  kernel.register({
    default: class extends DevCommand {
      constructor() {
        super(kernel);
      }
    },
  });
}
