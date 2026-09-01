import {
  Application,
  UsageError,
  loadManifest,
  checkForUpdate,
  formatUpdateNudge,
  type Application as App,
  type BootProfile,
  type MudahManifest,
  type UpdateCheckOptions,
} from '@mudah-cli/core';
import { detectCapabilities, osc, type TerminalCapabilities, type ThemeQueryInput } from '@mudah-cli/terminal';
import { Output, detectTheme, renderTable } from '@mudah-cli/ui';
import { ConsoleKernel, renderError, renderCommandHelp, renderCommandList, parseSignature, type CommandModule } from '@mudah-cli/console';
import HelpCommand from './commands/help.command.js';
import VersionCommand from './commands/version.command.js';
import MakeCommand from './commands/make.command.js';
import BuildCommand from './commands/build.command.js';
import DoctorCommand from './commands/doctor.command.js';
import ConfigShowCommand from './commands/config.show.command.js';
import ConfigDiffCommand from './commands/config.diff.command.js';
import ConfigSetCommand from './commands/config.set.command.js';
import ConfigValidateCommand from './commands/config.validate.command.js';
import DevCommand from './commands/dev.command.js';

/** Parsed timeout in milliseconds. */
function parseTimeout(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/i.exec(value.trim());
  if (!match) throw new UsageError(`Invalid timeout value "${value}". Use a number with optional suffix (ms, s, m).`);
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`Timeout must be a positive number, got "${value}".`);
  const unit = (match[2] ?? 'ms').toLowerCase();
  if (unit === 's') return Math.round(n * 1_000);
  if (unit === 'm') return Math.round(n * 60_000);
  return Math.round(n);
}

/** Parsed memory limit in bytes. */
function parseMemory(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(kb|mb|gb|tb|b)?$/i.exec(value.trim());
  if (!match) throw new UsageError(`Invalid memory value "${value}". Use a number with optional suffix (kb, mb, gb, tb, b).`);
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`Memory must be a positive number, got "${value}".`);
  const unit = (match[2] ?? 'mb').toLowerCase();
  if (unit === 'kb') return Math.round(n * 1_024);
  if (unit === 'mb') return Math.round(n * 1_048_576);
  if (unit === 'gb') return Math.round(n * 1_073_741_824);
  if (unit === 'tb') return Math.round(n * 1_099_511_627_776);
  return Math.round(n);
}

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
   * Stream the `'auto'` theme query reads from. Overriding it (and `stdout`)
   * lets tests answer the query without a real terminal.
   */
  stdin?: ThemeQueryInput;
  /**
   * Set false to never query the terminal for its colors. Tests and
   * non-interactive runs use it to keep startup synchronous.
   */
  allowThemeQuery?: boolean;
  /**
   * Publishable package name for the update nudge. Omit (or set
   * `checkUpdates: false`) to skip the check entirely — the default, since
   * only published apps can be compared against a registry.
   */
  updatePackage?: string;
  /** Override the update-check cache directory (tests). */
  updateCacheDir?: string;
  /**
   * Skip plugin discovery. Bundled apps with no `node_modules` (and tests
   * that don't want filesystem scanning) set this.
   */
  disablePlugins?: boolean;
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

  // Resolved once: every later write (envelopes included) targets these, so
  // output modes work with or without injected streams.
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  let manifest: MudahManifest;
  try {
    manifest = options.manifest ?? loadManifest(cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(message + '\n');
    return 1;
  }

  const app = options.app ?? new Application(cwd, manifest);

  const theme = await detectTheme({
    name: manifest.ui?.theme,
    allowQuery: caps.themeQuery && options.allowThemeQuery !== false,
    stdout,
    stdin: options.stdin,
  });
  const output = new Output({
    stream: stdout,
    errorStream: stderr,
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
  const profileMode = argv.includes('--profile');

  // Parse and strip global timeout/memory flags.
  let timeoutMs = 0;
  let memoryLimit = 0;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--timeout' && i + 1 < argv.length) {
      timeoutMs = parseTimeout(argv[i + 1]!);
      argv.splice(i, 2);
      i--;
    } else if (arg.startsWith('--timeout=')) {
      timeoutMs = parseTimeout(arg.slice(10));
      argv.splice(i, 1);
      i--;
    } else if (arg === '--memory' && i + 1 < argv.length) {
      memoryLimit = parseMemory(argv[i + 1]!);
      argv.splice(i, 2);
      i--;
    } else if (arg.startsWith('--memory=')) {
      memoryLimit = parseMemory(arg.slice(9));
      argv.splice(i, 1);
      i--;
    }
  }

  const startedAt = Date.now();

  // Advertise the working directory (OSC 7) once on launch so terminals that
  // track cwd pick it up. Skipped off-TTY and in JSON mode so logs stay clean.
  if (caps.osc7 && !jsonMode) osc.workingDir(stdout, cwd);

  // Update nudge: opt-in per app (a package name must be given) and never in
  // the way of scripts, CI, or machine-readable output.
  const ci = env?.['CI'] ?? process.env['CI'];
  const updateOptions: UpdateCheckOptions | undefined =
    options.updatePackage === undefined ||
    manifest.updates === false ||
    jsonMode ||
    !caps.isTty ||
    (ci !== undefined && ci !== '' && ci !== 'false')
      ? undefined
      : {
          packageName: options.updatePackage,
          currentVersion: manifest.version,
          cacheDir: options.updateCacheDir,
        };

  // Plugins first: their providers must be registered before boot, and their
  // commands join the same discovery list as the app's own.
  const plugins = options.disablePlugins === true ? [] : await app.discoverPlugins();

  // Providers: discover app providers, boot, then evaluate lazy predicates.
  await app.discoverProviders();
  const bootProfile = await app.boot({ profile: profileMode });
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
    // Plugin commands go last: registration is first-wins, so an app command
    // with the same name keeps precedence over the plugin's.
    ...plugins.flatMap((plugin) => plugin.commands as CommandModule[]),
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
      stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    }
  }

  // Strip the global flags before dispatch so commands don't see them as
  // unknown options; remember the command name for envelopes/errors.
  const dispatchArgv = argv.filter(
    (a) => a !== '--json' && a !== '--plain' && a !== '--profile',
  );
  const commandName = dispatchArgv[0];

  // Global flags.
  const [first] = dispatchArgv;
  if (first === undefined || first === '--help' || first === '-h') {
    if (jsonMode) {
      stdout.write(
        output.jsonEnvelope({ ok: true, exitCode: 0, command: 'help', commands: kernel.list().map((c) => c.name) }),
      );
      return 0;
    }
    const lines: string[] = [];
    renderCommandList(manifest.name, manifest.version, kernel.list(), lines);
    output.raw(lines.join('\n'));
    output.raw('\n\nGlobal flags:\n  --help/-h  Show this help\n  --version  Show the version\n  --json     Machine-readable JSON output\n  --plain    Strip all ANSI styling\n  --profile  Print boot and command timings\n  --timeout  Kill command after N ms (e.g. --timeout=5s)\n  --memory   Kill command when heap exceeds N MB (e.g. --memory=512mb)');
    return 0;
  }
  if (first === '--version') {
    if (jsonMode) {
      stdout.write(output.jsonEnvelope({ ok: true, exitCode: 0, command: 'version', version: manifest.version }));
      return 0;
    }
    output.info(`${manifest.name} v${manifest.version}`);
    return 0;
  }
  if ((argv[1] === '--help' || argv[1] === '-h') && kernel.has(first)) {
    if (jsonMode) {
      const entry = kernel.get(first)!;
      stdout.write(
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

  // Set up timeout and memory monitors.
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let memoryTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutFired = false;

  if (timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timeoutFired = true;
      process.exitCode = 124;
      output.error(`Command timed out after ${Math.round(timeoutMs / 1_000)}s`);
      // Emit exit event before forcing exit.
      void kernel.dispatch; // ensure reference is not lost
      process.kill(process.pid, 'SIGTERM');
    }, timeoutMs);
  }

  if (memoryLimit > 0) {
    memoryTimer = setInterval(() => {
      const used = process.memoryUsage().heapUsed;
      if (used > memoryLimit) {
        output.error(`Memory limit exceeded: ${(used / 1_048_576).toFixed(0)}MB > ${(memoryLimit / 1_048_576).toFixed(0)}MB`);
        process.exitCode = 137;
        process.kill(process.pid, 'SIGKILL');
      }
    }, 500);
  }

  function cleanupMonitors(): void {
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (memoryTimer) clearInterval(memoryTimer);
  }

  try {
    const code = await kernel.dispatch(resolveGroup(kernel, dispatchArgv));
    cleanupMonitors();
    if (jsonMode) {
      stdout.write(
        output.jsonEnvelope({
          ok: code === 0,
          exitCode: code,
          command: commandName,
          durationMs: Date.now() - startedAt,
          ...(bootProfile === undefined ? {} : { boot: bootProfile }),
        }),
      );
    } else {
      if (profileMode) {
        renderProfile(output, bootProfile, caps, {
          command: commandName,
          commandMs: Date.now() - startedAt - (bootProfile?.totalMs ?? 0),
          totalMs: Date.now() - startedAt,
        });
      }
      if (code === 0) await nudgeUpdate(output, manifest, updateOptions);
    }
    return code;
  } catch (rawError) {
    cleanupMonitors();
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
      stdout.write(
        output.jsonEnvelope({
          ok: false,
          exitCode: code,
          command: commandName,
          durationMs: Date.now() - startedAt,
          ...(bootProfile === undefined ? {} : { boot: bootProfile }),
          error: parsed,
        }),
      );
    }
    return code;
  }
}

/**
 * Render the `--profile` report. Uses `Output` so it respects `--plain`
 * (no ANSI) and keeps the timing data machine-readable under `--json`.
 */
function renderProfile(
  output: Output,
  boot: BootProfile | undefined,
  caps: TerminalCapabilities,
  totals: { command?: string; commandMs: number; totalMs: number },
): void {
  const rows: string[][] = [['total', `${totals.totalMs}ms`]];
  if (boot !== undefined) {
    rows.push(['boot', `${boot.totalMs}ms`]);
    // Every hook is listed, including sub-millisecond ones: which providers
    // are effectively free is exactly what you profile for.
    for (const timing of boot.providers) {
      rows.push([`  ${timing.provider}.${timing.hook}`, `${timing.durationMs}ms`]);
    }
  }
  if (totals.command !== undefined) {
    rows.push([`command ${totals.command}`, `${totals.commandMs}ms`]);
  }

  output.line();
  output.raw(
    renderTable(
      [
        { header: 'stage', align: 'left' },
        { header: 'time', align: 'right' },
      ],
      rows,
      { level: caps.colorLevel, unicode: caps.unicode },
    ),
  );
}

/**
 * Let a bare namespace run its group's `default` command, the way
 * `git remote` falls back to `git remote -h` style helpers: `db` runs
 * `db:default` when that command exists.
 *
 * Everything else is passed through untouched, so grouping never changes
 * how a real command resolves.
 */
function resolveGroup(kernel: ConsoleKernel, argv: string[]): string[] {
  const [name, ...rest] = argv;
  if (name === undefined || kernel.has(name) || !kernel.hasGroup(name)) return argv;
  const fallback = `${name}:default`;
  if (!kernel.has(fallback)) return argv;
  return [fallback, ...rest];
}

/**
 * Mention a newer published version, at most once per cache window.
 *
 * Deliberately narrow: only on success, only for a TTY, never in JSON mode,
 * and off entirely when the manifest says `updates: false` or CI is set. The
 * check is bounded by its own timeout, so a slow registry can't stall exit.
 */
async function nudgeUpdate(
  output: Output,
  manifest: MudahManifest,
  options: UpdateCheckOptions | undefined,
): Promise<void> {
  if (options === undefined) return;
  const info = await checkForUpdate(options).catch(() => undefined);
  if (info === undefined) return;
  const line = formatUpdateNudge(info, manifest.bin);
  if (line !== null) output.muted(line);
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
  kernel.register({ default: ConfigShowCommand });
  kernel.register({ default: ConfigDiffCommand });
  kernel.register({ default: ConfigSetCommand });
  kernel.register({ default: ConfigValidateCommand });
  kernel.register({
    default: class extends DevCommand {
      constructor() {
        super(kernel);
      }
    },
  });
}
