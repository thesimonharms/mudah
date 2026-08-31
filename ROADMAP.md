# Roadmap

Current release: **0.7.0**. v0.6 and v0.7 shipped. The [TUI skill](.cursor/skills/mudah-tui/SKILL.md) and [llms.txt](llms.txt) are the agent surface.

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

### Later (in this tree)

- `Sparkline`, `Tree`, `FuzzyList`
- Cell-level `DiffRenderer`
- `doctor` TUI dump
- Eval prompts: [eval/tui-prompts.md](eval/tui-prompts.md)

Not in this tree: shader wallpaper, audio cues, skills.sh publish, scored eval CI.

Dogfood: [examples/ops-desk](examples/ops-desk).

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
