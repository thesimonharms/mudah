# Mudah TUI recipes

Copy one of these. Change the data. Do not restyle the structure.

Imports in every recipe:

```ts
import { Command, s } from '@mudah-cli/mudah';
import {
  Column,
  Form,
  Label,
  List,
  MultiList,
  Overlay,
  Program,
  Screen,
  Split,
  Stack,
} from '@mudah-cli/mudah/tui';
import { TestTui } from '@mudah-cli/mudah/testing';
```

## Picker

One list. Enter selects. Escape quits with no pick.

```ts
export default class PickEnvCommand extends Command {
  signature = 'env';
  description = 'Pick a deploy environment';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('This command needs an interactive terminal.');
      this.output.hint('Use: my-app env --name=staging');
      return 2;
    }
    const screen = Screen.picker({ title: 'Environment', items: ['staging', 'production'] });
    const program = new Program();
    screen.attach(program);
    const code = await program.run();
    const picked = screen.result();
    if (picked) this.output.success(`Using ${picked}.`);
    return code;
  }
}
```

## Multi-pick

Space toggles. Enter submits the checked set. Prefer a wizard `multi` step.

```ts
const screen = Screen.wizard({
  title: 'Features',
  steps: [{ name: 'enable', kind: 'multi', items: ['cache', 'queue', 'metrics'] }],
});
const program = new Program();
screen.attach(program);
await program.run();
const chosen = screen.result()?.enable as string[] | undefined;
```

Or mount a `MultiList` in a `Column`. List rows are clickable.

## Dashboard

Clickable table, scrolling viewport, sidebar. Prefer `Screen.dashboard`.

```ts
export default class DashboardCommand extends Command {
  signature = 'dashboard';
  description = 'Open the full-screen dashboard';

  async handle(): Promise<number> {
    if (process.stdout.isTTY !== true) {
      this.output.error('The dashboard needs an interactive terminal.');
      return 2;
    }
    const screen = Screen.dashboard({
      title: 'Deploy',
      sidebar: ['2 services', 'esc to exit'],
      columns: [{ header: 'service' }, { header: 'env' }, { header: 'status', align: 'right' }],
      rows: [
        ['api-gateway', 'production', 'healthy'],
        ['auth-service', 'staging', 'degraded'],
      ],
    });
    const program = new Program({ mouse: true });
    screen.attach(program);
    const code = await program.run();
    if (code === 0) this.output.success('Dashboard closed.');
    return code;
  }
}
```

## Wizard

Two or more stages. One Program. Prefer `Screen.wizard`.

```ts
const screen = Screen.wizard({
  title: 'Convert',
  steps: [
    { name: 'files', kind: 'multi', items: files },
    { name: 'to', kind: 'pick', items: formats },
  ],
});
const program = new Program();
screen.attach(program);
await program.run();
return screen.result() as { files: string[]; to: string } | undefined;
```

## Form

```ts
const form = Form.fromSchema(
  s.object({
    name: s.string(),
    live: s.boolean(),
    env: s.enum(['dev', 'prod']),
  }),
);
const program = new Program();
form.attach(program);
await program.run();
form.result();
```

## TestTui

```ts
import { describe, expect, it } from 'vitest';
import { Screen } from '@mudah-cli/mudah/tui';
import { TestTui } from '@mudah-cli/mudah/testing';

describe('picker', () => {
  it('selects production', () => {
    const screen = Screen.picker({ title: 'Environment', items: ['staging', 'production'] });
    const tui = TestTui.mount(screen.root, { cols: 40, rows: 8 });
    expect(tui.snapshot()).toContain('Environment');
    tui.send('down').send('enter');
    expect(screen.result()).toBe('production');
    expect(tui.tree().role).toBe('Column');
  });
});
```
