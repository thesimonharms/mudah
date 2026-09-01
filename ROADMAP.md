# Roadmap

Current release: **0.7.0** (published). The 0.8.0 working tree is in progress (unreleased). The [TUI skill](.cursor/skills/mudah-tui/SKILL.md) and [llms.txt](llms.txt) are the agent surface. See `## Feature backlog` for the modular wishlist organized by package; see `## In tree, unreleased (0.8.0 prep)` for what already exists but isn't published yet.

## Shipped

### v0.2 to v0.5
OSC 10/11 theme query, config schemas, `--profile`, update nudge, Table/Panel/Viewport/mouse, command groups, plugins, vgpu, audio, TestApp.

### v0.6
1. **Row, Column, Split.** `Container` is a Column. Leftover space goes to `resize` children.
2. **`TestTui`.** Mount, `send` / `click` / `paste`, `snapshot()`, `tree()`. No PTY. `@mudah-cli/mudah/testing`.
3. **`Screen.picker` / `Screen.wizard` / `Screen.dashboard`.** Attach to a Program. Read `result()` after `run()`.
4. **Paint.** Theme keys on cells, SIGWINCH, `visibleLength` blit, TextInput caret, List mouse, bracketed paste, cell-level diff.
5. **Agent surface.** Skill, `llms.txt`, `make tui {picker|wizard|dashboard}`, `AGENTS.md` in the scaffolder, `doctor` prints a dump.

### v0.7
- `Stack` push/pop with a short slide (skipped when reduced-motion / CI)
- `Overlay`: modal, toast, `ctrl+k` palette. Escape closes the overlay first.
- `Form.fromSchema(s.object({...}))`
- `StatusBar`, `HelpFooter` from `keys.*`
- `Hyperlink` (OSC 8)
- `Image` (Kitty graphics or half-blocks)

## In tree, unreleased (0.8.0 prep)

Pre-existing in the tree before this pass (built and tested, not yet released):
- `Sparkline`, `Tree`, `FuzzyList` (`extras.ts`, `fuzzy.ts`)
- Cell-level `DiffRenderer`
- `doctor` TUI dump via `dumpTree` + `TestTui.tree()`
- Container: lazy/factory bindings, circular-dep detection, contextual/auto-injection, scoped (request) lifetime
- Config: env + file sources, schema validation, `env`/`loadEnvFile`, `ConfigRepository` dotted API
- Terminal: OSC 10/11 theme query, OSC 9 (Ghostty/WezTerm) notifications, OSC 7 working-directory, raw mode + bracketed paste enable/disable, Kitty keyboard protocol, Kitty graphics (image upload), mouse parsing
- Console: command groups + bare-namespace `group:default` fallback, signature parser (`{name?}`, `{name=default}`, `{paths...}`), `ArgumentParseError`, grouped + per-command help, `--profile`/`--json`/`--plain` modes
- Animation: `Spinner`, `TaskTree` with per-task lifecycle, `TaskRunner`
- UI: `Output` (styled/plain/json modes, envelopes, table/panel/markdown/panel), theme-aware syntax-highlighted code blocks, color/blend helpers, `Hyperlink`, `Image`
- Core: `Application`, providers (register/boot/lazy/evaluate), plugin discovery, plugin commands, `CheckForUpdate`/nudge, manifest/loader
- TUI: `Row`/`Column`/`Split`/`Stack`/`Overlay`/`Form`/`StatusBar`/`HelpFooter`/`Tabs`/`TabBar`, `Hyperlink`, `Image`, `Viewport`/`View`/`Paint`/`List`/`TextInput`, `TestTui` (mount/send/click/paste/snapshot/tree)
- Testing: `TestApp`, `TestTui`

Built this session (newly committed), modularly per package:
- `@mudah-cli/container` — introspection API `bindings()`, `instances()`, `isBound(name)`; tagged bindings (`tag(...)`/`tagged(tag)`) resolved through a tag index
- `@mudah-cli/config` — `redactSecrets` + `REDACT_KEYS` (key-name-based secret masking), reused by the config commands
- `@mudah-cli/terminal` — OSC 7 `osc.workingDir(stream, cwd)` + `osc7` capability + `guardedOsc.workingDir`; wired into `run()` (TTY + non-JSON only) and reported in `doctor`
- `@mudah-cli/core` + `@mudah-cli/console` — command **aliases** (`aliases:` field, kernel resolves alias→canonical name, first registration wins) and **deprecation** (`deprecated:` field → emits a muted warning; `--deprecated` flag lets callers force-run); help lists/hides accordingly
- `@mudah-cli/ui` — `renderBarChart(entries, {level,width,unicode,labels})` theme-aware horizontal bar chart (determinate, scaled to max value)
- `@mudah-cli/animation` — `TaskTree` explicit dependency edges between tasks
- `@mudah-cli/tui` — `Tabs` / `TabBar` widget (keyboard + mouse selection, scroll arrows, active-state sync)
- `@mudah-cli/mudah` — built-in `config:show {key?}` (redacted, `--json` envelope) and `config:diff {baseline?}` (`+`/`-`/`~` flat diff vs a baseline JSON file, secrets masked)
- `@mudah-cli/ui` — `renderLineChart(entries, {level,width,height,unicode,labels})` theme-aware line chart (sampled points + vertical connectors between differing heights)
- `@mudah-cli/tui` — `Calendar` widget (UTC month grid, `▸`-marked cursor day, arrow/page-up/page-down/home/end + enter to select)
- `@mudah-cli/tui` — `Checkbox` (toggle `[ ]` / `[x]`, space/enter, onSelect), `Radio` (single-select `○`/`●`, arrows + enter), `ProgressBar` (determinate display bar, 0..1, clamp + inspect())

## Feature backlog (modular, by package)

### `@mudah-cli/container` (IoC)
- Lazy/factory bindings resolved on first `make()`
- Context-aware bindings (`when(tenant).use(...)`)
- Decorator injection (`@inject`, `@singleton`) behind `isolatedModules`-safe transform
- Provider module factory: a `providers.ts` export array + auto-loader (Angular-style)
- Container-scoped disposal (`dispose()` on shutdown)
- `container.bindings()`/`instances()` introspection query API (filter by tag/group)
- Container snapshot/rollback for deterministic tests
- Async factories / promises in the resolution graph
- `runInScope(group, () => ...)` scoped lifetime accessor

### `@mudah-cli/config`
- Remote config source (`remote:` provider, fetch + 24h cache, like the update nudge)
- Secrets drivers (env, file, OS keyring) with redaction in `dump()`/`debug`
- `config:set {key} {value}` built-in (typed to existing keys, rejects schema violations)
- `config:validate` built-in (runs schema, surfaces issues + hint)
- `config:source {key}` — show which file/env/layer a key resolved from (precedence)
- Config file watch + hot-reload on change (SIGUSR1)
- Layered config precedence display (defaults < file < env < flag)

### `@mudah-cli/terminal`
- Theme-change listener: re-query OSC 10/11 on SIGWINCH
- True-color palette sniff + 256/16/true fallback picker
- Normalized modifier/alt-key parsing across Kitty/legacy (escape sequences)
- Terminal size poll via ioctl with a `tput cols` fallback
- OSC 9.1/9.2 notification variants (progress, bell)
- Bracketed-paste delivery in full-screen apps as a single `paste` event
- `enterRawMode`/raw-mode helpers for full-screen TUI apps

### `@mudah-cli/animation`
- `ProgressBar` with ETA and determinate/indeterminate modes
- Per-tick hooks (`onStart`, `onProgress`, `onComplete`)
- Easing presets for spinners/transitions (linear, ease-in-out, bounce, elastic)
- Frame-rate independent animation clock (delta-time based)

### `@mudah-cli/ui`
- Mini bar-chart + line-chart primitives (bar chart already in tree)
- Diff/icon glyphs (added/modified/deleted) in output
- Markdown tables rendered as `Table` widgets
- Markdown task-list (`- [x]`) → checkbox rendering
- Semantic `paint()` token reference documented per theme
- `paintToken(token, level)` palette for consistent highlighting across widgets

### `@mudah-cli/core`
- `--timeout` / `--memory` guards per command (auto-abort, exit 137/124)
- Command input/output stream redirection API
- Exit-code registry (`Command.exitMap`) for documented non-zero codes
- Event bus: `app.on('booted')`, `on('shutdown')`, `on('config:changed')`
- Plugin dependency graph resolution at boot
- Async `evaluateLazy()` predicate provider gating

### `@mudah-cli/console`
- Tab completion for commands, args, and options
- Persistent command history (readline-style) per app
- Typed argument coercion (`int`, `float`, `path`, `glob`, `enum`) ✅
- Man-page-style grouped help rendering
- Fuzzy command lookup on typo (did-you-mean via `FuzzyList`) ✅
- Subcommand aliases (e.g. `db:ls` ↔ `db:list`) ✅

### `@mudah-cli/tui` — widgets
- `Breadcrumb` (trailing-ellipsis, clickable crumbs) ✅
- `Calendar` / `DatePicker` (arrow + typing) ✅
- `FileBrowser` (tree file picker, with `FuzzyList` filter)
- `MenuBar` (pull-down menus, alt-underline access keys)
- `Toolbar` (iconic command strip)
- `Tooltip` / `Popover` (anchored to a widget) ✅
- `TextArea` (multiline `TextInput`, with scrollbars) ✅
- `Checkbox` / `RadioButton` group ✅
- `VirtualList` (windowing for large datasets) ✅
- `ResizableSplit` (live drag, like tmux resize-pane)
- `Spinner` widget (animation-driven) ✅
- `Pager` (less-like: search, jump, scrollback)
- `MetricGauge` (mini dial / progress ring) ✅
- `TreeView` (expand/collapse + keyboard nav)
- `Chart` widget wrapping the ui bar/line chart primitives ✅
- `ProgressBar` (determinate display bar) ✅

### `@mudah-cli/tui` — `Screen.*` flows
- `Screen.form` (wizard built from a `Form.fromSchema`) ✅
- `Screen.tree` (navigable tree + result) ✅
- `Screen.table` (CRUD over rows) ✅
- `Screen.pivot` (pivot-table over rows)
- `Screen.split` (side-by-side master/detail) ✅
- `Screen.notifications` (toast log center) ✅
- `Screen.menu` (command palette over a menu) ✅

### `@mudah-cli/testing`
- Style/ANSI assertions in snapshots (`expect(snap).toHaveColor('green')`) ✅
- Text-tree visual diff (char-level diff of `snapshot()`)
- `tui.snapshot()` baseline file format + `--update` flag
- Time-travel: `tui.undo()` / `tui.redo()` for stepping
- First-class FS + network mock helpers
- `tui.measure()` perf/budget assertions (`expect(tui).toBeFast()`)
- Mock plugin registry + factory for kernel tests

### `@mudah-cli/vgpu` (optional)
- WGSL shader hot-reload (`--watch`)
- Built-in shader catalog (plasma, metaballs, fire, Voronoi)
- Audio-reactive shaders synced to `@mudah-cli/audio`
- Framebuffer capture to PNG
- Shader parameter sliders rendered as a TUI overlay
- Shader `import` / include path resolution in WGSL
- Compute-shader pass for particle physics

### `@mudah-cli/audio` (optional)
- WAV/MP3 decode + streaming playback
- Tone-sequence DSL (note/duration)
- Beat/tempo sync (`bpm` clock source)
- Ducking + channel mixing
- Beat-grid quantizer
- Live microphone input + FFT band extraction
- Audio-reactive event bridge (for vgpu)

## Cross-cutting
- Plugin marketplace discovery (`mudah plugins list/update`)
- Plugin compatibility gates (peer range + runtime feature flags)
- `--profile` write per-provider timings to a JSON file for flamegraphing
- `mudah info` machine-readable env/health report (`--json`)
- Opt-in boot/perf telemetry (disabled by default, opt-in via `mudah.json`)
- i18n strings for command descriptions + prompts
- Accessibility tree export (`--a11y-tree`) for CI checks
- Headless CI rendering mode (deterministic plain-text dumps)
- Plugin dependency graph visualization (`mudah doctor --deps`)
- Built-in `migrate` command pattern (up/down, version table)
- `--autocomplete` shell-integration: emit bash/zsh/fish completions to stdout
- `mudah audit` — check plugins for known vulnerabilities + deprecation notices
- `mudah cache` — manage `.mudah/cache/` (update-check cache, plugin cache)
- Provider lifecycle hooks: `onShutdown()`, `onError()`, `onConfigChanged()`
- `--trace` flag: log every event bus dispatch for debugging provider ordering
- Provider health-check: `app.health()` returns per-provider status + latency
- `mudah graph` — render the provider dependency graph as ASCII or DOT

## Dogfooding / examples
- "Ops desk" → evolve into a multi-page shell (tabs, tree, logs, dashboards)
- Audio visualizer TUI example (audio ↔ vgpu ↔ sparks)
- Shader gallery example (`shader-lab` → pick/browse shaders)
- Published plugin example (`@thesimonharms/deploy-audit` style, with a `make plugin`)

## Docs / agent surface
- `llms.txt` expanded with per-widget option tables
- `mudah tutorial` interactive walkthrough command
- Component reference generated from each widget's `inspect()` contract
- TUI record/replay for demos (diff-based, no PTY)
- VS Code syntax/grammar contributions for `*.command.ts`

## Speculative / someday
- Terminal-native video playback (half-block + kitty graphics, audio via OS mixer)
- TUI widget layout debugger (overlay grid + live `tree()`)
- Language-server for Mudah apps (completion for `mudah.json`, command signatures)
- Web/WASI port of the pure widget layer (no shell I/O)
- `mudah replay` — record and replay terminal sessions (script(1)-style but structured)
- `mudah sandbox` — run a command in a namespace-isolated FS + network sandbox
- Plugin hot-reload: watch `node_modules` for changes, re-import providers
- `mudah test` — built-in test runner that discovers `*.test.ts` files and runs vitest
- `mudah storybook` — interactive widget gallery with live resizing
- Declarative TUI DSL: YAML/JSON layout descriptions that compile to Component trees
- `mudah deploy` — built-in deployment orchestration (multi-host, rolling updates)
- `mudah watch` — generic file-watcher that re-runs commands on change (like `dev` but declarative)

## Out of scope
- An Ink / React layer
- A 40-widget catalog
- Screenshot docs as the source of truth

## Agent loop

```
Screen.* or make tui
  → typecheck
  → TestTui snapshot + tree dump
  → error that names the fix
  → skill that forbids invention
```
