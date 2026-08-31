# ops-desk

Ship a release from the terminal. This app uses the Mudah TUI recipes: `Screen.*`, `Form.fromSchema`, `Overlay`, `Stack`, `FuzzyList`, and `TestTui`.

## Quick start

```sh
cd examples/ops-desk
node bin/ops-desk.js desk          # full-screen desk. ctrl+k opens the palette
node bin/ops-desk.js env           # Screen.picker
node bin/ops-desk.js ship          # Screen.wizard
node bin/ops-desk.js flags         # Form.fromSchema
node bin/ops-desk.js env staging   # no TUI
npm test
```

Escape closes a nested screen, then the palette, then the program.

## What it shows

| Command | Recipe |
| --- | --- |
| `desk` | Overlay + Stack + Split dashboard. Palette: ship, env, flags, find, keys |
| `env` | `Screen.picker` |
| `ship` | `Screen.wizard` (pick, multi, text) |
| `flags` | `Form.fromSchema` |

Flag form of every command skips the TUI. Piped stdout returns 2 and names the flag form.
