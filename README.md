# Mudah

*An ergonomic, animation-rich CLI framework* for the modern terminal.

Mudah is a TypeScript-first framework for building CLI applications that feel like premium desktop software: animated spinners, live task trees, themed panels, semantic prompts, and desktop notifications — on Node ≥ 26 and Bun, with zero runtime dependencies by default.

```sh
npm create @mudah-cli/mudah my-app
cd my-app
npm install
npm run start
```

```
╭─ Mudah ───────────────────────╮
│ ✓ Hello, World!               │
╰───────────────────────────────╯
```

## Why Mudah

- **Service-provider architecture, CLI-grade speed.** Service container, two-phase provider boot (`register` → `boot`), lazy providers, and command auto-discovery — the same mental model as pondoknusa, tuned for sub-150 ms cold starts.
- **Built for Ghostty, Kitty, and friends.** Capability detection drives everything: truecolor, unicode, OSC 9 desktop notifications, OSC 133 semantic prompts, reduced-motion respect.
- **ESM-only, TypeScript 7, zero third-party runtime deps.** The framework ships as 10 focused packages; your app depends on one (`@mudah-cli/mudah`).
- **Testable by construction.** `TestApp` runs your real commands in-process with captured output and chained assertions — no pty tricks.

## Quick start

```sh
npm create @mudah-cli/mudah hello-cli     # scaffold (npx -y create-mudah hello-cli)
cd hello-cli
npm install
npm run dev                    # watch mode: re-runs `welcome` on changes
```

The scaffold gives you:

```
hello-cli/
├── bin/hello-cli.js            # executable entrypoint: process.exitCode = await run()
├── mudah.json                  # app manifest (name, version, theme, update nudge)
├── src/
│   ├── commands/
│   │   └── welcome.command.ts  # commands: one file each, default export
│   └── providers/
│       └── AppProvider.ts      # providers: register() → boot()
├── config/
│   └── app.ts                  # config files merged into app.config()
└── test/
    └── welcome.test.ts         # TestApp-based command tests
```

### Writing a command

```ts
// src/commands/deploy.command.ts
import { Command } from '@mudah-cli/mudah';

export default class DeployCommand extends Command {
  signature = 'deploy {branch?} {ref=main} [--force] [--env=production]';
  description = 'Deploy the application';

  async handle() {
    const branch = this.arg('branch') ?? 'main';
    if (!this.option('force')) {
      const ok = await this.confirm(`Deploy ${branch}?`);
      if (!ok) return;
    }
    this.output.section(`Deploying ${branch}`);
    // …
    this.output.success('Deployed.');
    this.output.notification('Deploy', `branch ${branch} is live`);
  }
}
```

Signatures are string-based: `{required}`, `{optional?}`, `{name=default}`, `[--flag]`, `[--opt=value]`. The kernel parses, validates, and injects `input` for you. Unknown options, missing required args, and excess positionals become usage errors (exit 2) automatically.

### Providers

```ts
import { ServiceProvider } from '@mudah-cli/mudah';

export default class DatabaseProvider extends ServiceProvider {
  register(): void {
    this.app.singleton('db', async () => connect(this.app.config().get('db.url')));
  }
  boot(): void {
    this.app.events().on('command.after', (e) => flushMetrics(e.command, e.durationMs));
  }
}
```

Two-phase boot runs every `register()` first, then every `boot()` — so `boot()` can depend on anything any provider registered. Both hooks are async-first. Use `app.registerLazy(Provider, { commands: ['deploy'] })` to defer expensive providers until a matching command runs.

### Configuration

```ts
// config/db.ts
import { defineConfig } from '@mudah-cli/mudah';

export default defineConfig({
  url: env('DATABASE_URL', 'sqlite:///local.db'),
  pool: env('DB_POOL', 5),
});
```

`app.config().get('db.pool')` reads dotted keys; `mergeConfigFrom` in providers merges defaults under existing values (existing wins). `.env` loading is native (`process.loadEnvFile`) with typed parsing in `env()`.

## Packages

| Package | Purpose |
| --- | --- |
| `@mudah-cli/container` | High-performance IoC: bindings, singletons, constructor auto-injection, contextual bindings |
| `@mudah-cli/config` | Dotted-key config repository, `.env` handling, typed accessors |
| `@mudah-cli/terminal` | Capability detection, OSC emitters, ANSI helpers, key parsing |
| `@mudah-cli/animation` | Ticker, spinners, progress bars, parallel task trees |
| `@mudah-cli/ui` | Design tokens, the `sleek` theme, Output primitives (styled/plain/json), tables, panels, markdown |
| `@mudah-cli/core` | The kernel: `Application` (extends Container), providers, events, discovery |
| `@mudah-cli/console` | Signatures, `Command`, prompts (select/multiselect/password), the console kernel, help rendering |
| `@mudah-cli/tui` | Full-screen apps: alt-buffer `Program`, diff renderer, focus-managed widgets |
| `@mudah-cli/testing` | `TestApp` — in-process command dispatch with chained assertions |
| `@mudah-cli/mudah` | Umbrella + `run()` entrypoint and built-in commands |
| `@mudah-cli/create-mudah` | The scaffolder (`npm create @mudah-cli/mudah`) |

The `@mudah-cli/mudah` umbrella re-exports the public surface with subpaths: `@mudah-cli/mudah`, `@mudah-cli/mudah/ui`, `@mudah-cli/mudah/terminal`, `@mudah-cli/mudah/animation`, `@mudah-cli/mudah/tui`, `@mudah-cli/mudah/testing`.

### Pick your depth (à-la-carte by design)

Every package has its own npm name and depends on as little as possible, so you can enter the framework at any level — or skip it entirely and hack:

- **Just want colors?** `npm i @mudah-cli/ui` — `paint()`, themes, tables, panels. No kernel, no CLI, no opinions about your app structure.
- **Spinning progress in an existing script?** `@mudah-cli/animation` gives you `Spinner`/`ProgressBar`/`TaskRunner` with two dependencies and zero setup.
- **Parse modern key input?** `@mudah-cli/terminal` is standalone: capability detection, OSC emitters, `KeyParser`.
- **Your own command runner?** Skip `@mudah-cli/console`'s kernel and use just `parseSignature`/`parseInput`, or drop the whole layer and drive `Application` (the container + provider lifecycle) directly as a library.
- **Go lower still:** `@mudah-cli/container` and `@mudah-cli/config` have no Mudah dependencies at all — use them in any TypeScript project.
- **Full TUI without the framework?** `@mudah-cli/tui` mounts a `Program` on any streams you hand it: `new Program({ stdout, stdin })`. Nothing requires the `mudah` umbrella or a `mudah.json`.

Conversely, the umbrella (`@mudah-cli/mudah`) is the "all the parts" install: one dependency, the whole stack wired together with `run()`, auto-discovery, and built-in commands.

### Built-in commands

Every app ships with:

- `help [command]` — command list / per-command help
- `version` — app name + version
- `make {command|provider|config} {name}` — scaffold new pieces with correct structure
- `build` — runs the app's `build` script (bun or npm) with streaming output
- `doctor` — runtime, manifest, discovery, and terminal capability report
- `dev {command}` — watch mode: re-runs the command on changes (150 ms debounce)

Global flags: `--help`, `--version`. Every command understands `--help`.

Output modes work globally: `--json` emits machine-readable JSON lines plus a final `{ok, results|error}` envelope, and `--plain` strips all ANSI (log-friendly). Commands can target either mode explicitly via `this.output.isMachineReadable`.

### Prompts and full-screen TUIs

`Command` exposes interactive helpers that degrade gracefully — arrow-key UIs on a TTY, numbered/comma fallbacks when piped:

```ts
const env = await this.select('Environment', ['staging', 'production']); // ❯ arrow picker
const features = await this.multiselect('Enable', ['cache', 'queue']);   // space to toggle
const token = await this.password('API token');                          // masked input
```

For full-screen interfaces, build with `@mudah-cli/tui`:

```ts
import { Program, Container, List, Label, TextInput } from '@mudah-cli/mudah/tui';

const program = new Program();
const list = new List(items, (i) => program.quit());
program.mount(new Container().add(new Label('Deploy'), list, new TextInput()));
process.exitCode = await program.run(); // alt-buffer, diff-rendered, esc to exit
```

Widgets implement a two-method `Component` contract (`render(): string[]`, `onKey(event)`), so custom widgets are ordinary classes — focus cycling, key routing, and minimal repaints come from the container and renderer.

## Testing

Commands are tested in-process — real kernel, real providers, captured streams:

```ts
import { TestApp } from '@mudah-cli/mudah/testing';

it('greets a named person', async () => {
  const app = await TestApp.create({ cwd: appRoot });
  const result = await app.dispatch(['welcome', 'Mudah']);
  result.exit(0).outContains('Hello, Mudah!');
});
```

## Performance

Cold start (fresh process → rendered output → exit), Node 26, this machine:

```
baseline: node -e "hi"         p50    44ms
node: hello-cli --help         p50   131ms
node: hello-cli welcome        p50   129ms
```

The framework's full boot (providers, discovery, kernel) adds roughly 85 ms over a bare Node process. Bench with `npm run bench`; enforce p50 budgets with `npm run bench -- --check`. Set `MUDAH_BOOT_PROFILE=1` for per-provider register/boot timings.

## Development

```sh
bun install
npm run build        # tsc 7, all packages in dependency order
npm run typecheck    # strict across src + tests
npm run test         # vitest, all packages + example
npm run bench        # cold-start report
```

This repo runs on Bun for the dev loop (`bun install`, `bun x vitest`) and Node ≥ 26 for everything user-facing; the suite passes under either runtime.

### Release

Releases are manual — there is no CI auto-publish.

```sh
node scripts/release.mjs 0.1.0 --dry-run
node scripts/release.mjs 0.1.0
npm publish --workspaces --access public
```

The release script bumps all ten packages (and their internal deps) in lockstep, builds, and runs `npm pack --dry-run` per package. You'll need an npm login with publish rights to the `@mudah-cli` org.

## Design notes

- **`Application extends Container`.** The app *is* the service container — `app.make()`, `app.singleton()` work on it directly, and `app`/`config`/`events` are pre-bound singletons.
- **Async-first everywhere.** Provider hooks, command `handle()`, events, and `run()` all await. No callback corners.
- **Errors are a contract.** `UsageError` (exit 2, with usage + hint), `ExitError` (explicit code), `CommandCancelled` (130). `renderError` renders them identically in the real CLI and in tests.
- **Zero runtime deps by default.** Drivers (databases, HTTP, …) are your app's choice, injected through providers — a la pondoknusa.
- **Reduced motion is a first-class capability.** Spinners and animations degrade to static output when `MUDAH_REDUCED_MOTION=1`, the terminal is non-TTY, or CI is set.

## Roadmap

- **v0.2** — OSC 10 runtime theme query, config schema validation, `--profile` flag, per-command timing events, update nudge (semver check with cache).
- **v0.3** — richer TUI widgets (tables, panels, scrolling viewports, mouse support), command grouping/namespacing, plugin providers from `node_modules`.

## License

MIT
