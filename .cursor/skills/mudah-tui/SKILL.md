---
name: mudah-tui
description: >-
  Builds full-screen terminal UIs with Mudah (@mudah-cli/tui): Program,
  Screen recipes, Column/Row/Split, TestTui, Form.fromSchema, Overlay, Stack.
  Use when writing Mudah TUI code, dashboards, wizards, pickers, alt-buffer
  apps, or when the user mentions Mudah, @mudah-cli/tui, or terminal widgets.
  Do not use Ink, Blessed, ncurses, or raw ANSI.
---

# Mudah TUI

This skill is the way to write a Mudah TUI. Copy a recipe. Do not invent a fourth dialect.

Full copy-paste recipes: [examples.md](examples.md). Compact reference: [llms.txt](../../../llms.txt).

## 1. Choose the depth

| Need | Use | Not |
| --- | --- | --- |
| One shot, flags, `--json` | `Command` + `this.output` | `Program` |
| One question | `this.select` / `this.confirm` | `Program` |
| Full-screen | `Screen.*` then `Program` | Ink, Blessed, raw ANSI |

## 2. Forbidden

Do not import `ink`, `blessed`, `neo-blessed`, `terminal-kit`, `ncurses`, or React for a terminal UI.

Do not emit raw `\x1b[` sequences.

Do not write a custom `Component` when `Screen.picker`, `Screen.wizard`, `Screen.dashboard`, or `Form.fromSchema` fits.

Do not handle `escape` to quit. Return `false` and let `Program` quit, unless you are inside an `Overlay` (escape closes the overlay).

## 3. Pick a recipe

1. One item → `Screen.picker`
2. Several items → `MultiList` or a wizard `multi` step
3. Two or more stages → `Screen.wizard`
4. Table + sidebar → `Screen.dashboard`
5. Schema fields → `Form.fromSchema(s.object({...}))`
6. None of those → `Column` / `Row` / `Split` plus built-in widgets
7. Still none → one class that extends `BaseComponent`

```ts
import { Program, Screen, Column, Row, Split, Form } from '@mudah-cli/mudah/tui';
import { TestTui } from '@mudah-cli/mudah/testing';
import { s } from '@mudah-cli/mudah';
```

## 4. Program lifecycle

```ts
const screen = Screen.picker({ title: 'Env', items: ['staging', 'prod'] });
const program = new Program({ mouse: true });
screen.attach(program);
const code = await program.run();
const picked = screen.result();
```

`mount()` a layout before `run()`. Roots: `Column`, `Row`, `Split`, `Container`, `Stack`, `Overlay`.

Non-TTY: error, hint the flag form, return 2.

## 5. Layout

`Column` vertical. `Row` horizontal. `Split` two panes with a drag bar (`axis: 'horizontal' | 'vertical'`, `ratio` 0 to 1). `Container` is a Column.

Children that implement `resize` take leftover space (`Viewport`, `Table`, `Panel`, nested layouts). No flex. No CSS. No gap.

`Stack.push` / `pop` for screens. `Overlay` wraps a base layout: `openModal`, `toast`, `openPalette`. `ctrl+k` opens the palette.

## 6. Widget map

| Widget | Use for |
| --- | --- |
| `List` | One pick (arrows, click, wheel) |
| `MultiList` | Many picks (space toggles) |
| `Table` | Grid |
| `Viewport` | Clip a tall child |
| `TextInput` | One line. Caret, paste, left/right |
| `Panel` / `Label` | Box / static text |
| `StatusBar` / `HelpFooter` | Chrome from `keys.*` |
| `Hyperlink` | OSC 8 |
| `Image` | Kitty or half-blocks |
| `Sparkline` / `Tree` / `FuzzyList` | Chart / tree / filter |

## 7. Tests

```ts
const tui = TestTui.mount(screen.root, { cols: 80, rows: 24 });
tui.send('down').send('enter');
expect(tui.snapshot()).toContain('▸');
expect(tui.tree().role).toBe('Column');
```

CLI commands that are not a TUI use `TestApp`.

Every new TUI ships with a TestTui test: snapshot contains the title, and a key path sets `result()`.

## 8. Checklist

- [ ] Depth choice is honest
- [ ] Recipe from §3 before a custom widget
- [ ] Imports are `@mudah-cli/mudah/tui`, not Ink
- [ ] Non-TTY path returns 2
- [ ] `TestTui` snapshot + tree
- [ ] No raw ANSI
