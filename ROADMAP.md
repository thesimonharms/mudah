# Roadmap

Current release: **0.7.0** (published). The 0.8.0 working tree is in progress (unreleased): `Stack`, `Overlay`, `Form`, `StatusBar`/`HelpFooter`, `Hyperlink`, `Image`, plus `Sparkline`/`Tree`/`FuzzyList` and cell-level `DiffRenderer` are built and tested but not yet on the registry. The [TUI skill](.cursor/skills/mudah-tui/SKILL.md) and [llms.txt](llms.txt) are the agent surface.

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

### In tree, unreleased (0.8.0 prep)
- `Sparkline`, `Tree`, `FuzzyList` (`extras.ts`, `fuzzy.ts`)
- Cell-level `DiffRenderer`
- `doctor` TUI dump via `dumpTree` + `TestTui.tree()`

## Feature backlog (modular, by package)

### `@mudah-cli/container` (IoC)
- Lazy/factory bindings resolved on first `make()`
- Scoped (request) lifetime in addition to singleton/transient
- Context-aware bindings (`when(tenant).use(...)`)
- Decorator injection (`@inject`, `@singleton`) behind `isolatedModules`-safe transform
- Circular-dependency detection with a path in the error
- Container introspection: `bindings()`, `instances()`, `isBound(name)`
- Tagged bindings + tagged resolvers (`tag(tag)` / `taggedBy(tag)`)

### `@mudah-cli/config`
- Remote config source (`remote:` provider, fetch + 24h cache, like the update nudge)
- Secrets drivers (env, file, OS keyring) with redaction in `dump()`/`debug`
- `config:show {key?}` and `config:diff` built-in commands
- Schema-powered `mudah.json` IntelliSense package (`@mudah-cli/config/types`)
- Validation issue hints at import listing every offending key (already ships)

### `@mudah-cli/terminal`
- OSC 7 (working directory) emission + cwd updates
- OSC 9.1/9.2 notification sequences
- Theme-change listener: re-query OSC 10/11 on SIGWINCH
- True-color palette sniff + 256/16/true fallback picker
- Normalized modifier/alt-key parsing across Kitty/legacy
- Bracketed-paste delivery in full-screen apps as a single `paste` event

### `@mudah-cli/animation`
- `ProgressBar` with ETA and determinate/indeterminate modes
- `TaskTree` with explicit dependency edges between tasks
- Per-tick hooks (`onStart`, `onProgress`, `onComplete`)
- Easing presets for spinners/transitions

### `@mudah-cli/ui`
- Theme-aware syntax-highlighted code blocks in panels
- Markdown tables rendered as `Table` widgets
- Mini bar-chart + line-chart primitives (alongside `Sparkline`)
- Diff/icon glyphs (added/modified/deleted) in output
- Semantic `paint()` token reference documented per theme

### `@mudah-cli/core`
- Command aliases (one handler, multiple signatures)
- Command deprecation with a `--deprecated` warning
- `command.before` / `command.after` middleware pipeline (auth, rate-limit, dry-run)
- `command.stash` — snapshot command output for `command.undo`/replay
- Async result envelope refinements under `--json`
- Permission scopes per command (declarative `authorize()`)

### `@mudah-cli/console`
- Tab completion for commands, args, and options
- Persistent command history (readline-style) per app
- Typed argument coercion (`int`, `float`, `path`, `glob`, `enum`)
- Variadic positionals + `{name=default}` defaults (signature parser refinements)
- Man-page-style grouped help rendering

### `@mudah-cli/tui` — widgets
- `Tabs` / `TabBar` (keyboard + mouse, scrollable)
- `Breadcrumb` (trailing-ellipsis)
- `Calendar` / `DatePicker` (arrow + typing)
- `FileBrowser` (tree file picker, with `FuzzyList` filter)
- `MenuBar` (pull-down menus, alt-underline access keys)
- `Toolbar` (iconic command strip)
- `Tooltip` / `Popover` (anchored to a widget)
- `TextArea` (multiline `TextInput`, with scrollbars)
- `Checkbox` / `RadioButton` group
- `VirtualList` (windowing for large datasets)
- `ResizableSplit` (live drag, like tmux resize-pane)
- `Spinner` widget (animation-driven)
- `Pager` (less-like: search, jump, scrollback)
- `MetricGauge` (mini dial / progress ring)
- Focus-trap + arrow-key focus traversal policy
- Themeable widget skins via `ui.theme` token overrides

### `@mudah-cli/tui` — `Screen.*` flows
- `Screen.tabs` (named tabs workflow)
- `Screen.form` (wizard built from a schema, reuses `Form`)
- `Screen.table` (CRUD over rows)
- `Screen.tree` (navigable tree + result)
- `Screen.menu` (command palette over a menu)
- `Screen.notifications` (toast log center)

### `@mudah-cli/testing`
- Style/ANSI assertions in snapshots (`expect(snap).toHaveColor('green')`)
- Text-tree visual diff (char-level diff of `snapshot()`)
- Time-travel: `tui.undo()` / `tui.redo()` for stepping
- First-class FS + network mock helpers
- Boot/perf budget assertions (`expect(tui).toBeFast()`)

### `@mudah-cli/vgpu` (optional)
- WGSL shader hot-reload (`--watch`)
- Built-in shader catalog (plasma, metaballs, fire, Voronoi)
- Audio-reactive shaders synced to `@mudah-cli/audio`
- Framebuffer capture to PNG
- Shader parameter sliders rendered as a TUI overlay

### `@mudah-cli/audio` (optional)
- WAV/MP3 decode + streaming playback
- Tone-sequence DSL (note/duration)
- Beat/tempo sync (`bpm` clock source)
- Ducking + channel mixing
- Audio-reactive event bridge (for vgpu)

## Cross-cutting
- Plugin marketplace discovery (`mudah plugins list/update`)
- Plugin compatibility gates (peer range + runtime feature flags)
- `--profile` write per-provider timings to a JSON file for flamegraphing
- `mudah info` machine-readable env/health report (JSON)
- Opt-in boot/perf telemetry (disabled by default, opt-in via `mudah.json`)
- i18n strings for command descriptions + prompts
- Accessibility tree export (`--a11y-tree`) for CI checks
- Headless CI rendering mode (deterministic plain-text dumps)
- Plugin dependency graph visualization (`mudah doctor --deps`)
- Built-in `migrate` command pattern (up/down, version table)

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
