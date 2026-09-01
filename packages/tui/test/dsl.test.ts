import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TestTui } from '@mudah-cli/testing';
import {
  Checkbox,
  Column,
  Label,
  LayoutDebugger,
  LayoutSyntaxError,
  Panel,
  ProgressBar,
  SessionRecorder,
  Split,
  VideoFrames,
  VideoPlayer,
  compileLayout,
  fromLayout,
  parseLayout,
  parseSessionTape,
  renderWidgetToText,
  renderWidgetTree,
  replayTape,
  replayTapeAsync,
  widgetReference,
  widgetReferenceMarkdown,
} from '@mudah-cli/tui';

describe('fromLayout', () => {
  it('compiles a column + label and snapshots the title', () => {
    const root = fromLayout({
      type: 'column',
      children: [{ type: 'label', text: 'Hello DSL' }],
    });
    expect(root).toBeInstanceOf(Column);
    const tui = TestTui.mount(root as Column, { cols: 40, rows: 6 });
    expect(tui.snapshot()).toContain('Hello DSL');
  });

  it('compiles a list inside a row', () => {
    const root = fromLayout({
      type: 'row',
      children: [
        { type: 'label', text: 'pick' },
        { type: 'list', items: ['one', 'two'] },
      ],
    });
    const lines = root.render().join('\n');
    expect(lines).toContain('pick');
    expect(lines).toContain('one');
  });

  it('parses YAML layouts and names unknown types', () => {
    const node = parseLayout(`
type: column
children:
  - type: label
    text: yaml-hello
`);
    expect(node.type).toBe('column');
    expect(fromLayout(node).render().join('\n')).toContain('yaml-hello');
    expect(() => fromLayout({ type: 'nope' } as never)).toThrow(LayoutSyntaxError);
  });

  it('compiles split, progress, checkbox, and panel nodes', () => {
    const root = compileLayout({
      type: 'split',
      axis: 'vertical',
      children: [
        { type: 'panel', title: 'left', text: 'aa' },
        {
          type: 'column',
          children: [
            { type: 'checkbox', text: 'on', checked: true },
            { type: 'progress', value: 0.5 },
          ],
        },
      ],
    });
    expect(root).toBeInstanceOf(Split);
    const text = root.render().join('\n');
    expect(text).toContain('left');
    expect(root).toBeInstanceOf(Split);
    const compiled = compileLayout(`type: checkbox\ntext: ready\nchecked: true\n`);
    expect(compiled).toBeInstanceOf(Checkbox);
    expect(compileLayout({ type: 'progress', value: 1 })).toBeInstanceOf(ProgressBar);
    expect(compileLayout({ type: 'panel', title: 'box', text: 'hi' })).toBeInstanceOf(Panel);
  });
});

describe('widgetReference', () => {
  it('returns inspect() roles for built-in widgets', () => {
    const roles = widgetReference().map((entry) => entry.role);
    expect(roles).toContain('list');
    expect(roles).toContain('table');
    expect(roles).toContain('input');
    expect(roles).toContain('toolbar');
    expect(roles).toContain('pager');
    expect(roles).toContain('form');
    expect(roles).toContain('TestTui');
    expect(widgetReferenceMarkdown()).toContain('| role | options |');
  });
});

describe('speculative TUI surfaces', () => {
  it('plays half-block video frames', () => {
    const video = VideoFrames.demo(3);
    expect(video.play(0).length).toBe(2);
    expect(video.play(3)).toEqual(video.play(0));
  });

  it('records and replays keys on TestTui', () => {
    const list = fromLayout({ type: 'list', items: ['one', 'two', 'three'] });
    const tui = TestTui.mount(new Column().add(list), { cols: 20, rows: 6 });
    const rec = new SessionRecorder();
    rec.record({ type: 'key', key: 'down' }).record({ type: 'key', key: 'down' });
    rec.replay(tui);
    expect(tui.snapshot()).toContain('▸ three');
    expect(rec.dump()).toHaveLength(2);
  });

  it('renders a widget without process I/O', () => {
    expect(renderWidgetToText(new Label('wasi-safe'))).toContain('wasi-safe');
  });

  it('draws a layout debugger overlay', () => {
    const root = new Column().add(new Label('top'), new Label('bottom'));
    const dbg = new LayoutDebugger(root, 12, 4);
    expect(dbg.tree().role).toBe('Column');
    expect(dbg.overlay()).toContain('+');
  });

  it('plays, pauses, and seeks a VideoPlayer', () => {
    const player = new VideoPlayer({ frames: VideoFrames.demo(4).frames, fps: 10 });
    expect(player.length).toBe(4);
    player.tick(100);
    expect(player.index).toBe(1);
    player.toggle();
    player.tick(500);
    expect(player.paused).toBe(true);
    expect(player.index).toBe(1);
    player.seek(3);
    expect(player.render().join('\n')).toContain('paused');
  });

  it('selects layout debugger boxes with tab', () => {
    const root = new Column().add(new Label('top'), new Label('bottom'));
    const dbg = new LayoutDebugger(root, 12, 4);
    expect(dbg.overlay()).toContain('*');
    dbg.onKey({ name: 'tab' });
    expect(dbg.legend().some((line) => line.startsWith('▸1'))).toBe(true);
  });

  it('parses a session tape object and replays keys', () => {
    const tape = parseSessionTape({
      version: 1,
      recordedAt: '1970-01-01T00:00:00.000Z',
      cols: 20,
      rows: 6,
      events: [{ type: 'key', key: 'down', t: 10 }],
    });
    const list = fromLayout({ type: 'list', items: ['one', 'two'] });
    const tui = TestTui.mount(new Column().add(list), { cols: 10, rows: 4 });
    replayTape(tui, tape);
    expect(tui.snapshot()).toContain('▸ two');
  });

  it('honors timestamps during async replay', async () => {
    const waits: number[] = [];
    const list = fromLayout({ type: 'list', items: ['one', 'two'] });
    const tui = TestTui.mount(new Column().add(list), { cols: 10, rows: 4 });
    await replayTapeAsync(
      tui,
      {
        version: 1,
        recordedAt: '1970-01-01T00:00:00.000Z',
        events: [
          { type: 'key', key: 'down', t: 0 },
          { type: 'key', key: 'down', t: 40 },
        ],
      },
      { speed: 2, sleep: async (ms) => { waits.push(ms); } },
    );
    expect(waits).toEqual([20]);
  });

  it('exports a WASI-safe inspect tree as JSON', () => {
    const json = renderWidgetTree(new Label('node'));
    expect(JSON.parse(json).role).toBe('Label');
  });

  it('keeps wasi.ts free of process and fs', () => {
    const src = readFileSync(new URL('../src/wasi.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\bprocess\b/);
    expect(src).not.toMatch(/\bnode:fs\b/);
  });
});
