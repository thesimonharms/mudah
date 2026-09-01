import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TestApp, TestTui } from '@mudah-cli/mudah/testing';
import { AudioViz } from '../src/viz.js';

const appDir = fileURLToPath(new URL('..', import.meta.url));

describe('audio-viz command', () => {
  it('returns 2 without a TTY', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['viz']);
    result.exit(2).errContains('interactive terminal');
  });
});

describe('audio-viz screen', () => {
  it('snapshots the title and a key path sets result', () => {
    const viz = new AudioViz();
    const tui = TestTui.mount(viz.root, { cols: 40, rows: 10 });
    expect(tui.snapshot()).toContain('audio-viz');
    expect(tui.snapshot()).toContain('energy');
    tui.send('down').send('down').send('enter');
    expect(viz.result).toBe('beat');
    expect(tui.snapshot()).toContain('energy 0.95');
  });
});
