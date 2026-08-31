# Agent notes for ops-desk

This app uses Mudah. For a full-screen TUI:

1. Import from `@mudah-cli/mudah/tui` and `@mudah-cli/mudah/testing`.
2. Prefer `Screen.picker`, `Screen.wizard`, or `Screen.dashboard` before a custom Component.
3. Layout is `Column`, `Row`, and `Split` only. `Container` is a Column.
4. Test with `TestTui.mount(root).send('down').snapshot()` and `tree()`. No PTY.
5. Do not use Ink, Blessed, or raw ANSI.

The desk lives in `src/desk.ts`. Commands in `src/commands/` attach a Program or print when flags are set.
