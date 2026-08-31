import { describe, expect, it } from 'vitest';
import { Spinner, Tooltip } from '@mudah-cli/tui';

describe('Spinner', () => {
  it('advances frames over time and wraps', () => {
    const s = new Spinner(['a', 'b', 'c'], 100);
    expect(s.render()).toEqual(['a']);
    s.tick(100);
    expect(s.render()).toEqual(['b']);
    s.tick(200);
    expect(s.render()).toEqual(['a']);
  });

  it('renders a label after the glyph', () => {
    const s = new Spinner(['·'], 100);
    s.setLabel('loading');
    expect(s.render()).toEqual(['· loading']);
  });

  it('uses a custom frame set', () => {
    const s = new Spinner(['|', '/', '-', '\\'], 50);
    s.tick(50);
    expect(s.render()).toEqual(['/']);
  });

  it('is not focusable', () => {
    expect(new Spinner().focusable).toBe(false);
  });
});

describe('Tooltip', () => {
  it('combines title and text with an em-dash', () => {
    const t = new Tooltip('port', 'listening port');
    expect(t.render()).toEqual(['port — listening port']);
  });

  it('returns just the title when text is empty', () => {
    const t = new Tooltip('port', '');
    expect(t.render()).toEqual(['port']);
  });

  it('updates its text', () => {
    const t = new Tooltip('host', 'localhost');
    t.setText('0.0.0.0');
    expect(t.render()).toEqual(['host — 0.0.0.0']);
  });

  it('is not focusable', () => {
    expect(new Tooltip('t', 'x').focusable).toBe(false);
  });
});
