import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestApp, TestTui } from '@mudah-cli/mudah/testing';
import { Form, Screen } from '@mudah-cli/mudah/tui';
import { OpsDesk } from '../src/desk.js';
import { ENVIRONMENTS, flagSchema, fleet } from '../src/data.js';

const appDir = fileURLToPath(new URL('..', import.meta.url));

describe('ops-desk commands', () => {
  it('picks env from an argument', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['env', 'production']);
    result.exit(0).outContains('Using production.');
  });

  it('returns 2 for env with no TTY and no name', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['env']);
    result.exit(2).errContains('interactive terminal');
  });

  it('ships from flags', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['ship', 'staging', '--note=hot-fix']);
    result.exit(0).outContains('Shipped to staging (hot-fix).');
  });

  it('sets flags from options', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['flags', '--region=sfo', '--canary']);
    result.exit(0).outContains('region=sfo');
  });

  it('returns 2 for desk without a TTY', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['desk']);
    result.exit(2).errContains('interactive terminal');
  });
});

describe('recipes', () => {
  it('Screen.picker selects production', () => {
    const screen = Screen.picker({ title: 'Environment', items: [...ENVIRONMENTS] });
    const tui = TestTui.mount(screen.root, { cols: 40, rows: 8 });
    expect(tui.snapshot()).toContain('Environment');
    tui.send('down').send('enter');
    expect(screen.result()).toBe('production');
  });

  it('Screen.wizard walks env and targets', () => {
    const names = fleet().slice(0, 3).map((s) => s.name);
    const screen = Screen.wizard({
      title: 'Ship',
      steps: [
        { name: 'env', kind: 'pick', items: [...ENVIRONMENTS] },
        { name: 'targets', kind: 'multi', items: names },
      ],
    });
    TestTui.mount(screen.root).send('enter').send('space').send('enter');
    expect(screen.result()).toEqual({ env: 'staging', targets: [names[0]] });
  });

  it('Form.fromSchema toggles canary', () => {
    const form = Form.fromSchema(flagSchema());
    TestTui.mount(form.root).send('space').send('enter');
    expect(form.result()?.canary).toBe(true);
    expect(form.result()?.region).toBe('iad');
  });
});

describe('ops desk', () => {
  const previous = process.env.MUDAH_REDUCED_MOTION;

  beforeAll(() => {
    process.env.MUDAH_REDUCED_MOTION = '1';
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.MUDAH_REDUCED_MOTION;
    else process.env.MUDAH_REDUCED_MOTION = previous;
  });

  it('paints a split dashboard', () => {
    const desk = new OpsDesk();
    const snap = TestTui.mount(desk.root, { cols: 80, rows: 20 }).snapshot();
    expect(snap).toContain('ops-desk');
    expect(snap).toContain('│');
    expect(snap).toContain('api-gateway');
    expect(desk.root.inspect?.()?.role).toBe('overlay');
  });

  it('switches env from the palette', () => {
    const desk = new OpsDesk();
    const tui = TestTui.mount(desk.root, { cols: 80, rows: 20 });
    tui.send('ctrl+k');
    expect(tui.snapshot()).toContain('Switch environment');
    tui.send('down').send('enter');
    expect(tui.snapshot()).toContain('Environment');
    tui.send('down').send('enter');
    expect(desk.state.env).toBe('production');
    expect(tui.snapshot()).toContain('production');
  });

  it('closes the palette on escape without quitting the desk', () => {
    const desk = new OpsDesk();
    const tui = TestTui.mount(desk.root, { cols: 80, rows: 20 });
    tui.send('ctrl+k');
    expect(tui.snapshot()).toContain('Ship a release');
    tui.send('escape');
    expect(tui.snapshot()).toContain('api-gateway');
    expect(tui.snapshot()).not.toContain('Ship a release');
  });

  it('finds a service with FuzzyList', () => {
    const desk = new OpsDesk();
    const tui = TestTui.mount(desk.root, { cols: 80, rows: 20 });
    tui.send('ctrl+k').send('down').send('down').send('down').send('enter');
    tui.send('a').send('u').send('t').send('h');
    expect(tui.snapshot()).toContain('auth-service');
    expect(tui.snapshot()).not.toContain('api-gateway');
    tui.send('enter');
    expect(tui.snapshot()).toContain('api-gateway');
  });
});
