# Mudah

*An ergonomic, animation-rich CLI framework* for the modern terminal.

Mudah is a TypeScript-first framework for building CLI applications that feel like premium desktop software: animated spinners, live task trees, themed panels, semantic prompts, and desktop notifications — on Node ≥ 26 and Bun, with zero runtime dependencies by default. GPU shaders (`@mudah-cli/vgpu`) and OS audio (`@mudah-cli/audio`) are optional extras.

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
- **Built for Ghostty, Kitty, and friends.** Capability detection drives everything: truecolor, unicode, OSC 9 desktop notifications, OSC 10/11 theme query, OSC 133 semantic prompts, reduced-motion respect.
- **ESM-only, TypeScript 7, zero third-party runtime deps.** The framework ships as focused packages; your app depends on one (`@mudah-cli/mudah`). GPU shaders live in optional `@mudah-cli/vgpu`. OS mixer audio lives in optional `@mudah-cli/audio`.
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

Signatures are string-based: `{required}`, `{optional?}`, `{name=default}`, `[--flag]`, `[--opt=value]`. A colon in the name (`db:status`) puts the command in a group. The kernel parses, validates, and injects `input` for you. Unknown options, missing required args, and excess positionals become usage errors (exit 2) automatically.

Set `groupDescription` on any command in the group to label it in `--help`. A bare namespace (`deploy`) runs `deploy:default` when that command exists.

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
import { defineConfig, env, s } from '@mudah-cli/mudah';

export default defineConfig(
  s.object({
    url: s.string(),
    pool: s.number().min(1).default(5),
  }),
  {
    url: env('DATABASE_URL', 'sqlite:///local.db'),
    pool: env('DB_POOL', 5),
  },
);
```

Pass a schema as the first argument and a bad value fails at import with every offending key listed. `app.config().validate('db', schema)` re-checks a subtree at boot. `app.config().get('db.pool')` reads dotted keys. `mergeConfigFrom` in providers merges defaults under existing values (existing wins). `.env` loading is native (`process.loadEnvFile`) with typed parsing in `env()`.

## Packages

| Package | Purpose |
| --- | --- |
| `@mudah-cli/container` | High-performance IoC: bindings, singletons, constructor auto-injection, contextual bindings |
| `@mudah-cli/config` | Dotted-key config repository, `.env` handling, typed accessors, schema validation |
| `@mudah-cli/terminal` | Capability detection, OSC emitters (including OSC 10/11 theme query), Kitty graphics, Kitty keyboard (key-up), ANSI helpers, key and mouse parsing |
| `@mudah-cli/animation` | Ticker, spinners, progress bars, parallel task trees |
| `@mudah-cli/ui` | Design tokens, the `sleek` theme, Output primitives (styled/plain/json), tables, panels, markdown |
| `@mudah-cli/core` | The kernel: `Application` (extends Container), providers, events, discovery, plugins, update nudge |
| `@mudah-cli/console` | Signatures, `Command`, grouped names (`db:status`), prompts (select/multiselect/password), the console kernel, help rendering |
| `@mudah-cli/tui` | Full-screen apps: alt-buffer `Program`, `Row`/`Column`/`Split` layout, diff renderer, tables, panels, viewports, mouse, Kitty keyboard |
| `@mudah-cli/vgpu` | Optional. Run [vgpu](https://vgpu.sh/) WGSL effects and blit the pixels to the terminal (Kitty graphics, half-block fallback) |
| `@mudah-cli/audio` | Optional. Play PCM through the OS mixer (streaming output, one-shot WAV). Kitty cannot carry audio |
| `@mudah-cli/testing` | `TestApp` — in-process command dispatch with chained assertions |
| `@mudah-cli/mudah` | Umbrella + `run()` entrypoint and built-in commands |
| `@mudah-cli/create-mudah` | The scaffolder (`npm create @mudah-cli/mudah`) |

The `@mudah-cli/mudah` umbrella re-exports the public surface with subpaths: `@mudah-cli/mudah`, `@mudah-cli/mudah/ui`, `@mudah-cli/mudah/terminal`, `@mudah-cli/mudah/animation`, `@mudah-cli/mudah/tui`, `@mudah-cli/mudah/testing`.

### Pick your depth (à-la-carte by design)

Every package has its own npm name and depends on as little as possible, so you can enter the framework at any level — or skip it entirely and hack:

- **Just want colors?** `npm i @mudah-cli/ui` — `paint()`, themes, tables, panels. No kernel, no CLI, no opinions about your app structure.
- **Spinning progress in an existing script?** `@mudah-cli/animation` gives you `Spinner`/`ProgressBar`/`TaskRunner` with two dependencies and zero setup.
- **Parse modern key input?** `@mudah-cli/terminal` is standalone: capability detection, OSC emitters, `KeyParser`, mouse, Kitty graphics, Kitty key-up.
- **GPU shaders in the terminal?** `@mudah-cli/vgpu` runs a WGSL effect through [vgpu](https://vgpu.sh/) and blits the pixels. The umbrella does not depend on it.
- **Sound from a CLI or a game loop?** `@mudah-cli/audio` writes PCM to PipeWire / Pulse / ALSA (or a native RtAudio peer). The umbrella does not depend on it. Kitty has no PCM protocol.
- **Your own command runner?** Skip `@mudah-cli/console`'s kernel and use just `parseSignature`/`parseInput`, or drop the whole layer and drive `Application` (the container + provider lifecycle) directly as a library.
- **Go lower still:** `@mudah-cli/container` and `@mudah-cli/config` have no Mudah dependencies at all — use them in any TypeScript project.
- **Full TUI without the framework?** `@mudah-cli/tui` mounts a `Program` on any streams you hand it: `new Program({ stdout, stdin })`. Nothing requires the `mudah` umbrella or a `mudah.json`.

Conversely, the umbrella (`@mudah-cli/mudah`) is the "all the parts" install: one dependency, the whole stack wired together with `run()`, auto-discovery, and built-in commands.

## Examples

**[examples/ops-desk](examples/ops-desk)** — ship a release from the terminal. `Screen.picker` / `wizard`, `Form.fromSchema`, Overlay palette, Stack, FuzzyList, `TestTui`:

```sh
cd examples/ops-desk
node bin/ops-desk.js desk          # full-screen. ctrl+k palette, esc back
node bin/ops-desk.js env staging   # flag form, no TUI
npm test
```

**[examples/deploy-console](examples/deploy-console)** — a deployment console that uses every v0.2 and v0.3 feature: schema-validated config, grouped commands (`deploy:`, `db:`), `--profile`, OSC 10 theme query, TUI tables/panels/viewports/mouse, the update nudge, and a plugin loaded from `node_modules` (`@thesimonharms/deploy-audit` → `audit:last`):

```sh
cd examples/deploy-console
node bin/deploy.js --help
node bin/deploy.js deploy:run staging --dry-run
node bin/deploy.js db:status --profile
node bin/deploy.js audit:last
node bin/deploy.js dashboard          # full-screen TUI; esc to exit
```

**[examples/shader-lab](examples/shader-lab)** — live WGSL effects in the terminal. `@mudah-cli/vgpu` runs the shader. Kitty graphics (or half-blocks) blits the pixels. Hold space to raise energy (Kitty key-up):

```sh
cd examples/shader-lab
node bin/shader-lab.js
```

**[examples/tone](examples/tone)** — streaming sine through the OS mixer. `@mudah-cli/audio` writes PCM. Hold space to raise pitch. `1` queues a blip:

```sh
cd examples/tone
node bin/tone.js
```

**[examples/melody](examples/melody)** — public-domain tunes through the OS mixer. Starts with Beethoven's Ode to Joy. `1` / `2` / `3` switch tunes. Space pauses:

```sh
cd examples/melody
node bin/melody.js
```

**[examples/convert-img](examples/convert-img)** — the ultimate image converter, both a CLI and a TUI, with zero npm dependencies beyond `@mudah-cli/mudah`:

```sh
cd examples/convert-img
bun bin/convert-img.js formats                 # capability matrix for this machine
bun bin/convert-img.js convert *.png --to=webp # batch CLI (variadic paths)
bun bin/convert-img.js                         # full-screen TUI wizard
bun test                                       # 19 tests, real conversions
```

Codecs come from `Bun.Image` (native libjpeg-turbo/spng/libwebp) plus optional system tools (libheif for HEIC/AVIF, ImageMagick for GIF) auto-detected at startup — a live demo of the driver/provider pattern: the planner picks a direct route when one exists, otherwise routes through PNG in two hops (e.g. `heic → png → gif`).

### Built-in commands

Every app ships with:

- `help [command]` — command list / per-command help
- `version` — app name + version
- `make {command|provider|config|tui} {name}` — scaffold commands, providers, config, or a TUI screen (`make tui picker`)
- `build` — runs the app's `build` script (bun or npm) with streaming output
- `doctor` — runtime, manifest, discovery, and terminal capability report
- `dev {command}` — watch mode: re-runs the command on changes (150 ms debounce)

Global flags: `--help`, `--version`, `--profile`. Every command understands `--help`. `--profile` prints boot and command timings through `Output` (a table in the terminal, a `boot` block under `--json`).

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
import { Program, Column, Split, Label, Panel, Table, Viewport } from '@mudah-cli/mudah/tui';

const program = new Program({ mouse: true });
const table = new Table([{ header: 'service' }, { header: 'status' }], rows);
program.mount(
  new Column()
    .add(new Label('Deploy'))
    .add(new Split({ ratio: 0.3 }).add(new Panel('Summary', ['ok']), new Viewport(table, 12))),
);
process.exitCode = await program.run(); // alt-buffer, diff-rendered, esc to exit
```

Widgets implement a two-method `Component` contract (`render(): string[]`, `onKey(event)`). Custom widgets are ordinary classes. Focus cycling, key routing, mouse, and minimal repaints come from the layout and renderer. Start from `Screen.picker`, `Screen.wizard`, or `Screen.dashboard` before a custom widget. `Column`, `Row`, and `Split` are the layout language (`Container` is a `Column`). `Table`, `Panel`, and `Viewport` cover grids, titled boxes, and scrolling windows. Test with `TestTui` from `@mudah-cli/mudah/testing`.

### Plugins

A plugin is an installed package whose `package.json` lists the `mudah-plugin` keyword. Its entry point may export a provider class (name ending in `Provider`, or a `providers` array). It may also export a `commands` array. `run()` discovers these from `node_modules` before boot. A plugin that fails to import is skipped, so a third-party package cannot take the host app down. Pass `disablePlugins: true` to skip discovery (tests, bundled apps).

### Update nudge

Set `"updates": true` in `mudah.json` and pass `updatePackage` to `run()` (the published npm name). On a successful TTY run, Mudah compares the running version to the registry (24h cache, 1.5s timeout). It then prints one muted line when a newer version exists. The check never throws. CI, `--json`, and `updates: false` skip it.

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

Publishing is a single manual command — it bumps every `@mudah-cli/*` package (and pins internal deps) in lockstep, builds all packages in dependency order, then publishes them to npm in the same order:

```sh
npm run release -- minor              # bump minor + build + publish
npm run release -- 0.8.0              # exact version
npm run release -- --dry-run          # preview: no files rewritten, no upload
npm run release -- --skip-publish     # bump + build only (no npm publish)
```

`npm login` is expected to be configured beforehand — this script never stores or creates credentials, and npm itself refuses to publish when `CI=true`, so releases are always run by hand. Publishing is intentionally not part of CI (see `.github/workflows/ci.yml`).

## Design notes

- **`Application extends Container`.** The app *is* the service container — `app.make()`, `app.singleton()` work on it directly, and `app`/`config`/`events` are pre-bound singletons.
- **Async-first everywhere.** Provider hooks, command `handle()`, events, and `run()` all await. No callback corners.
- **Errors are a contract.** `UsageError` (exit 2, with usage + hint), `ExitError` (explicit code), `CommandCancelled` (130). `renderError` renders them identically in the real CLI and in tests.
- **Zero runtime deps by default.** Drivers (databases, HTTP, …) are your app's choice, injected through providers — a la pondoknusa.
- **Reduced motion is a first-class capability.** Spinners and animations degrade to static output when `MUDAH_REDUCED_MOTION=1`, the terminal is non-TTY, or CI is set.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Current release is 0.7.0: `Stack` push/pop with a short slide (skipped when reduced-motion / CI), `Overlay`: modal, toast, `ctrl+k` palette. Escape closes the overlay first. `Form.fromSchema(s.object({...}))`, `StatusBar`, `HelpFooter` from `keys.*`, `Hyperlink` (OSC 8), `Image` (Kitty graphics or half-blocks). The TUI skill lives at [.cursor/skills/mudah-tui](.cursor/skills/mudah-tui/SKILL.md).

## License

MIT
