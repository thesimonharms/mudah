import { describe, expect, it } from 'vitest';
import { TestTui } from '@mudah-cli/testing';
import {
  Column,
  Label,
  LayoutDebugger,
  SessionRecorder,
  VideoFrames,
  fromLayout,
  renderWidgetToText,
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
});
